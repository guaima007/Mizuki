// 设备数据配置文件

export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
}

// 设备类别类型，支持品牌和自定义类别
export type DeviceCategory = Record<string, Device[]> & {
	自定义?: Device[];
};

export const devicesData: DeviceCategory = {
	手机: [
		{
			name: "iPhone 14 Pro Max",
			image: "/images/device/iphone14promax.webp",
			specs: "256GB / 暗紫色",
			description: "A16 仿生芯片，4800 万像素主摄，灵动岛设计。",
			link: "https://www.apple.com.cn/iphone-14-pro/",
		},
	],
	平板: [
		{
			name: "HUAWEI MatePad Pro",
			image: "/images/device/matepadpro.webp",
			specs: "HarmonyOS",
			description: "华为旗舰平板，支持多屏协同与智慧分屏。",
			link: "https://consumer.huawei.com/cn/tablets/matepad-pro/",
		},
	],
	路由器: [
		{
			name: "TP-WMC180",
			image: "/images/device/tpwmc180.webp",
			specs: "WiFi 6",
			description: "TP-Link 无线路由器，稳定可靠的网络连接。",
			link: "https://www.tp-link.com.cn/",
		},
	],
	相机: [
		{
			name: "Fujifilm X-S10",
			image: "/images/device/fujifilmxs10.webp",
			specs: "2610 万像素 / X-Trans CMOS 4",
			description: "富士经典色彩模拟，轻便机身，五轴防抖。",
			link: "https://fujifilm-x.com/cn/cameras/x-s10/",
		},
		{
			name: "Canon IXY 550",
			image: "/images/device/canonixy550.webp",
			specs: "口袋数码相机",
			description: "佳能便携卡片机，随身记录日常。",
			link: "https://www.canon.com.cn/",
		},
	],
};
