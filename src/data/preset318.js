// 318 川藏线 9 天预设数据
// 坐标系：WGS-84（高德返回的 GCJ-02 在 Phase 2 接入转换层后会统一为 WGS-84）
// 本预设直接以 WGS-84 近似坐标给出，供快速加载模板使用。

export const preset318 = {
  name: '318 川藏线（成都 → 拉萨）',
  description: '经典川藏南线，全程约 2100km，建议 9~10 天。',
  days: [
    {
      dayNumber: 1,
      overnight: '康定',
      waypoints: [
        { name: '成都', lng: 104.0665, lat: 30.5728, altitude: 500 },
        { name: '雅安', lng: 103.0010, lat: 29.9877, altitude: 620 },
        { name: '泸定', lng: 102.2349, lat: 29.9145, altitude: 1330 },
        { name: '康定', lng: 101.9576, lat: 30.0556, altitude: 2395 },
      ],
    },
    {
      dayNumber: 2,
      overnight: '雅江',
      waypoints: [
        { name: '康定', lng: 101.9576, lat: 30.0556, altitude: 2395 },
        { name: '折多山垭口', lng: 101.8000, lat: 30.0380, altitude: 4298 },
        { name: '新都桥', lng: 101.4960, lat: 30.0500, altitude: 3460 },
        { name: '雅江', lng: 101.0150, lat: 30.0320, altitude: 2530 },
      ],
    },
    {
      dayNumber: 3,
      overnight: '理塘',
      waypoints: [
        { name: '雅江', lng: 101.0150, lat: 30.0320, altitude: 2530 },
        { name: '剪子湾山', lng: 100.5800, lat: 30.0600, altitude: 4659 },
        { name: '卡子拉山', lng: 100.3500, lat: 30.0300, altitude: 4718 },
        { name: '理塘', lng: 100.2700, lat: 29.9970, altitude: 4014 },
      ],
    },
    {
      dayNumber: 4,
      overnight: '巴塘',
      waypoints: [
        { name: '理塘', lng: 100.2700, lat: 29.9970, altitude: 4014 },
        { name: '海子山', lng: 99.7000, lat: 29.5000, altitude: 4685 },
        { name: '姊妹湖', lng: 99.5600, lat: 29.6800, altitude: 4470 },
        { name: '巴塘', lng: 99.1080, lat: 30.0040, altitude: 2575 },
      ],
    },
    {
      dayNumber: 5,
      overnight: '左贡',
      waypoints: [
        { name: '巴塘', lng: 99.1080, lat: 30.0040, altitude: 2575 },
        { name: '金沙江大桥', lng: 98.9300, lat: 29.8200, altitude: 2470 },
        { name: '芒康', lng: 98.5930, lat: 29.6800, altitude: 3870 },
        { name: '东达山', lng: 98.1500, lat: 29.7200, altitude: 5130 },
        { name: '左贡', lng: 97.8410, lat: 29.6710, altitude: 3750 },
      ],
    },
    {
      dayNumber: 6,
      overnight: '八宿',
      waypoints: [
        { name: '左贡', lng: 97.8410, lat: 29.6710, altitude: 3750 },
        { name: '邦达草原', lng: 97.4500, lat: 30.0300, altitude: 4300 },
        { name: '业拉山', lng: 97.1500, lat: 30.0000, altitude: 4658 },
        { name: '怒江72拐', lng: 97.0500, lat: 29.9000, altitude: 3900 },
        { name: '八宿', lng: 96.9230, lat: 30.0530, altitude: 3260 },
      ],
    },
    {
      dayNumber: 7,
      overnight: '波密',
      waypoints: [
        { name: '八宿', lng: 96.9230, lat: 30.0530, altitude: 3260 },
        { name: '然乌湖', lng: 96.7600, lat: 29.4900, altitude: 3850 },
        { name: '波密', lng: 95.7680, lat: 29.8590, altitude: 2720 },
      ],
    },
    {
      dayNumber: 8,
      overnight: '林芝',
      waypoints: [
        { name: '波密', lng: 95.7680, lat: 29.8590, altitude: 2720 },
        { name: '通麦', lng: 95.0300, lat: 30.0400, altitude: 2000 },
        { name: '鲁朗林海', lng: 94.7400, lat: 29.9700, altitude: 3300 },
        { name: '色季拉山', lng: 94.6200, lat: 29.6000, altitude: 4728 },
        { name: '林芝', lng: 94.3620, lat: 29.6490, altitude: 3000 },
      ],
    },
    {
      dayNumber: 9,
      overnight: '拉萨',
      waypoints: [
        { name: '林芝', lng: 94.3620, lat: 29.6490, altitude: 3000 },
        { name: '工布江达', lng: 93.2460, lat: 29.8860, altitude: 3360 },
        { name: '米拉山', lng: 92.6800, lat: 29.8200, altitude: 5013 },
        { name: '拉萨', lng: 91.1409, lat: 29.6456, altitude: 3650 },
      ],
    },
  ],
}
