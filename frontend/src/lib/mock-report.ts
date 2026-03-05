export const MOCK_REPORT = {
  title: "주간 마케팅 리포트 (2024-11-25)",
  created_at: 1732550400,
  sections: [
    {
      title: "채널별 세션 요약 (11월)",
      rows: [
        { channel_group: "Organic Search", total_sessions: "54120", total_users: "48320" },
        { channel_group: "Google Ads", total_sessions: "38470", total_users: "32100" },
        { channel_group: "Facebook Ads", total_sessions: "25840", total_users: "21500" },
        { channel_group: "Direct", total_sessions: "14230", total_users: "12800" },
        { channel_group: "기타", total_sessions: "9720", total_users: "8400" },
      ],
    },
    {
      title: "미디어 소스별 설치 건수 (11월)",
      rows: [
        { media_source: "Google Ads", total_installs: "5840" },
        { media_source: "Facebook Ads", total_installs: "4210" },
        { media_source: "organic", total_installs: "3980" },
        { media_source: "Apple Search Ads", total_installs: "2640" },
        { media_source: "TikTok Ads", total_installs: "1970" },
      ],
    },
    {
      title: "미디어 소스별 구매 매출 (11월)",
      rows: [
        { media_source: "Google Ads", total_revenue: "98450000" },
        { media_source: "Facebook Ads", total_revenue: "72380000" },
        { media_source: "organic", total_revenue: "68910000" },
        { media_source: "Apple Search Ads", total_revenue: "31240000" },
        { media_source: "TikTok Ads", total_revenue: "13740000" },
      ],
    },
  ],
};

