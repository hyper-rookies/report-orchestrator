export interface KpiData {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

export interface ChannelShare {
  name: string;
  value: number;
}

export interface DailyTrend {
  date: string;
  sessions: number;
  installs: number;
}

export const MOCK_KPIS: KpiData[] = [
  { label: "총 세션", value: "142,380", change: "+8.4%", positive: true },
  { label: "총 설치", value: "18,640", change: "+14.2%", positive: true },
  { label: "구매 매출 (KRW)", value: "₩284,720,000", change: "+22.1%", positive: true },
  { label: "평균 참여율", value: "63.4%", change: "-1.8%", positive: false },
];

export const MOCK_CHANNEL_SHARE: ChannelShare[] = [
  { name: "Organic Search", value: 38 },
  { name: "Google Ads", value: 27 },
  { name: "Facebook Ads", value: 18 },
  { name: "Direct", value: 10 },
  { name: "기타", value: 7 },
];

export const MOCK_TREND: DailyTrend[] = [
  { date: "11/24", sessions: 4210, installs: 520 },
  { date: "11/25", sessions: 4380, installs: 548 },
  { date: "11/26", sessions: 4120, installs: 498 },
  { date: "11/27", sessions: 5640, installs: 721 },
  { date: "11/28", sessions: 7890, installs: 1043 },
  { date: "11/29", sessions: 6520, installs: 884 },
  { date: "11/30", sessions: 5280, installs: 672 },
];

