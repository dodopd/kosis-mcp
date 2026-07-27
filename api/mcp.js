const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const KOSIS_API_KEY = process.env.KOSIS_API_KEY || '';

function buildServer() {
  const server = new McpServer({ name: 'kosis-mcp-dankkumi', version: '1.0.0' });

  server.tool(
    'search_statistics',
    'KOSIS(통계청)에 등록된 90만 건 이상의 통계표를 키워드로 검색합니다. 학령인구, 학생수, 실업률, 인구, GDP 등 원하는 주제의 통계표를 찾을 때 가장 먼저 사용하세요. 결과의 ORG_ID(기관ID)와 TBL_ID(통계표ID)를 get_statistics_data에 넘겨서 실제 수치를 조회할 수 있습니다.',
    {
      keyword: z.string().describe('검색할 키워드 (예: 학령인구, 초등학생수, 장래인구추계)'),
      resultCount: z.number().optional().describe('가져올 결과 개수 (기본 20)'),
    },
    async ({ keyword, resultCount }) => {
      const params = new URLSearchParams({
        method: 'getList',
        apiKey: KOSIS_API_KEY,
        format: 'json',
        jsonVD: 'Y',
        searchNm: keyword,
        resultCount: String(resultCount || 20),
        sort: 'RANK',
      });
      const url = `https://kosis.kr/openapi/statisticsSearch.do?${params.toString()}`;
      try {
        const r = await fetch(url);
        const text = await r.text();
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `검색 중 오류: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get_statistics_data',
    'KOSIS 통계표의 실제 수치 데이터를 조회합니다. 먼저 search_statistics로 찾은 orgId와 tblId를 사용하세요. 연도 범위를 지정하지 않으면 최근 5개 시점을 가져옵니다.',
    {
      orgId: z.string().describe('기관 ID (search_statistics 결과의 ORG_ID 값)'),
      tblId: z.string().describe('통계표 ID (search_statistics 결과의 TBL_ID 값)'),
      startPrdDe: z.string().optional().describe('조회 시작 시점 (예: 2015)'),
      endPrdDe: z.string().optional().describe('조회 종료 시점 (예: 2024)'),
      prdSe: z.string().optional().describe('수록주기: Y(연), H(반기), Q(분기), M(월), D(일), IR(비정기). 기본값 Y'),
      objL1: z.string().optional().describe('분류1 코드. 모르면 ALL 그대로 두세요'),
    },
    async ({ orgId, tblId, startPrdDe, endPrdDe, prdSe, objL1 }) => {
      const params = new URLSearchParams({
        method: 'getList',
        apiKey: KOSIS_API_KEY,
        format: 'json',
        jsonVD: 'Y',
        orgId,
        tblId,
        itmId: 'ALL',
        objL1: objL1 || 'ALL',
        prdSe: prdSe || 'Y',
      });
      if (startPrdDe) params.set('startPrdDe', startPrdDe);
      if (endPrdDe) params.set('endPrdDe', endPrdDe);
      if (!startPrdDe && !endPrdDe) params.set('newEstPrdCnt', '5');

      const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?${params.toString()}`;
      try {
        const r = await fetch(url);
        const text = await r.text();
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `조회 중 오류: ${e.message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get_statistics_list',
    'KOSIS 주제별(MT_ZTITLE) 또는 기관별(MT_OTITLE) 통계 목록을 계층적으로 탐색합니다. search_statistics로 원하는 표를 못 찾았을 때 분류를 따라가며 찾는 용도입니다.',
    {
      vwCd: z.string().optional().describe('MT_ZTITLE(주제별, 기본값) 또는 MT_OTITLE(기관별)'),
      parentListId: z.string().optional().describe('상위 목록 ID. 비우면 최상위 목록부터 시작'),
    },
    async ({ vwCd, parentListId }) => {
      const params = new URLSearchParams({
        method: 'getList',
        apiKey: KOSIS_API_KEY,
        format: 'json',
        jsonVD: 'Y',
        vwCd: vwCd || 'MT_ZTITLE',
        parentListId: parentListId || '',
      });
      const url = `https://kosis.kr/openapi/statisticsList.do?${params.toString()}`;
      try {
        const r = await fetch(url);
        const text = await r.text();
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `조회 중 오류: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}

module.exports = async function handler(req, res) {
  if (!KOSIS_API_KEY) {
    res.status(500).json({ error: 'KOSIS_API_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
};
