import type { FullscreenWallpaperConfig } from "../types/config";

// 全屏壁纸配置
export const fullscreenWallpaperConfig: FullscreenWallpaperConfig = {
	src: {
		desktop: [
			"/assets/desktop-banner/1.webp", // TODO: 替换为咒术回战主题壁纸
			"/assets/desktop-banner/2.webp",
			"/assets/desktop-banner/3.webp",
			"/assets/desktop-banner/4.webp",
		], // 桌面横幅图片
		mobile: [
			"/assets/mobile-banner/1.webp", // TODO: 替换为咒术回战主题壁纸
			"/assets/mobile-banner/2.webp",
			"/assets/mobile-banner/3.webp",
			"/assets/mobile-banner/4.webp",
		], // 移动横幅图片
	}, // 使用本地横幅图片
	position: "center", // 壁纸位置，等同于 object-position
	carousel: {
		enable: true, // 启用轮播
		interval: 5, // 轮播间隔时间（秒）
	},
	zIndex: -1, // 层级，确保壁纸在背景层
	opacity: 0.85, // 壁纸透明度（略高，让咒术回战壁纸更清晰）
	blur: 0, // 背景模糊程度（0=不模糊，让壁纸清晰展示）
};
