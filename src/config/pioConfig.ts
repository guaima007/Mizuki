import type { PioConfig } from "../types/config";

// Pio 看板娘配置
export const pioConfig: PioConfig = {
	enable: false, // 关闭看板娘（如需开启请改为 true）
	models: ["/pio/models/NOIR/noir.model3.json"], // 默认模型路径
	position: "left", // 模型位置
	width: 280, // 默认宽度
	height: 250, // 默认高度
	mode: "draggable", // 默认为可拖拽模式
	hiddenOnMobile: true, // 默认在移动设备上隐藏
	hideAboutMenu: false, // 隐藏内置 About 菜单按钮
	dialog: {
		welcome: "領域展開へようこそ！", // 欢迎词
		touch: [
			"やめろ！",
			"呪いが暴走する！",
			"黒閃を見たいか？",
			"術式解放！",
		], // 触摸提示
		home: "ここをクリックしてホームページに戻る！", // 首页提示
		skin: ["新しい衣装を見たいか？", "新しい衣装は最高だ〜"], // 换装提示
		close: "また会おう... 最強を目指して", // 关闭提示
		link: "https://github.com/LyraVoid/Mizuki", // 关于链接
	},
};
