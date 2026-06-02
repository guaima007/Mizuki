---
title: 第一次接触视觉：MaixCAM Pro 燃气表码表识别课设复盘
published: 2026-06-02
description: "从 MaixCAM 自带 OCR 效果不理想到自己采集数据集、训练 YOLOv5s，并在 MaixCAM Pro 上完成燃气表码表数字识别与反光条计数。"
tags: ["MaixCAM", "YOLO", "计算机视觉", "课程设计"]
category: 项目实战
draft: false
image: /images/posts/maixcam-gas-meter/cover.png
lang: zh-CN
---

## 写在前面

这次课设是我第一次比较完整地接触视觉和模型训练。之前做电赛时主要打的是功率组，对摄像头、图像预处理、数据集和模型部署这一套并不熟悉。刚开始看到题目里写着可以用 OCR 或 AI 推理识别数字，我的第一反应也是先试 MaixCAM 自带的 OCR。

结果并不理想。

燃气表视频是电脑屏幕播放后再由 MaixCAM 摄像头拍摄，画面里有屏幕纹理、反光、倾斜和模糊。码表数字本身还会滚动，最后一位附近有反光条。OCR 对这种场景不够稳定，尤其是数字区域很小、背景又是红色的时候，很容易识别错或者直接识别不到。

所以后面我把思路改成了：自己采集部署场景下的数据集，训练一个 YOLOv5s 数字检测模型，再部署到 MaixCAM Pro 上。

![YOLO 数字检测效果](/images/posts/maixcam-gas-meter/effect-digit-boxes.png)

## 题目要求

课程设计的目标可以拆成三个功能：

1. 使用摄像头拍摄电脑上播放的燃气表视频，检测码表数字区域，并把这个区域裁剪后居中显示到 LCD。
2. 识别码表数字区域里的数字，并把识别结果用绿色小字标到每个数字区域右上角。
3. 对最后一位数字区域的反光条转过次数进行计数，并把计数结果显示在 LCD 左上角。

一开始我以为这三件事都应该交给 YOLO 或 OCR。真正实现之后发现，任务最好拆开做：整块数字窗口定位用传统视觉，单个数字识别用 YOLO，反光条计数再单独做状态检测。

## 整体方案

最终方案大致是下面这条链路：

![系统总体框图](/images/posts/maixcam-gas-meter/report-system-block.png)

核心分工如下：

- 数字窗口定位：使用 HSV 红色阈值、形态学处理和轮廓筛选，找出燃气表红色码表窗口。
- 居中显示：把检测到的码表窗口裁剪出来，按 LCD 尺寸等比例缩放后贴到画布中央。
- 数字识别：使用 MaixHub 训练 YOLOv5s，类别为 `0-9`，每个框对应一个单独数字。
- 计数：取最右侧数字区域，检测反光条从无到有的状态变化，并加入最小时间间隔避免重复计数。

这个拆法的好处是：不把所有问题都压到模型上。YOLO 只负责它最适合的部分，也就是单个数字的定位和分类；而整块码表区域本身颜色特征很明显，用传统视觉反而更快、更稳，也不需要额外标注一类“数字窗口”。

主程序运行时，则是围绕“采集一帧图像、定位码表窗口、识别数字、更新计数、刷新 LCD”这个循环展开：

![主程序流程](/images/posts/maixcam-gas-meter/report-main-flow.png)

## 数据集采集

训练数据没有直接从视频文件截帧，而是让 MaixCAM Pro 摄像头真实拍摄电脑上播放的视频。这样采到的图和部署时看到的图更一致，包括屏幕纹理、角度、亮度、焦距和反光。

采集脚本固定使用 `320x224` 输入尺寸。流程是：

1. 在 MaixVision 中运行 `collect_yolo_digits.py`。
2. 摄像头对准电脑屏幕上的燃气表视频。
3. LCD 上先预览，不自动保存，方便调整焦距、距离和角度。
4. 设置当前画面对应的三位数字，例如 `CAPTURE_LABELS = "355"`。
5. 点击 LCD 上的 START 开始连续保存图片和 YOLO 标签。
6. 播放到下一组读数时，停止采集，调整三位标签后继续。

采集到的单张原图类似这样：

![MaixCAM 实拍采集图](/images/posts/maixcam-gas-meter/sample-capture.jpg)

为了减少标注工作量，我没有完全手工画框，而是做了半自动预标注。脚本会先用传统视觉找到红色码表窗口，再按位置估计出三个数字框，最后生成 YOLO 格式标签：

```text
images/digits_355_000000.jpg
labels/digits_355_000000.txt
classes.txt
```

对应的标签内容类似：

```text
3 0.267188 0.569196 0.128125 0.263393
5 0.514062 0.558036 0.128125 0.241071
5 0.787500 0.533482 0.187500 0.263393
```

这样做之后，人工工作从“每张图从零画三个框”变成了“检查框有没有偏、类别有没有错”。对于这种规则比较强的场景，预标注能省很多时间。

预标注里最核心的一步，是把脚本分割出来的数字框转换成 YOLO 需要的归一化坐标。这里没有直接保存像素坐标，而是保存 `x_center / y_center / width / height`，并统一归一化到当前采集图尺寸：

```python
def rect_to_yolo(rect, img_w, img_h):
    x, y, w, h = clamp_rect(rect, img_w, img_h)
    cx = (x + w * 0.5) / img_w
    cy = (y + h * 0.5) / img_h
    nw = w / img_w
    nh = h / img_h
    return cx, cy, nw, nh


def save_yolo_sample(bgr, segments, labels, sample_id):
    stem = "digits_%s_%06d" % (labels, sample_id)
    img_path = os.path.join(images_dir, stem + ".jpg")
    label_path = os.path.join(labels_dir, stem + ".txt")

    cv2.imwrite(img_path, bgr, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])

    img_h, img_w = bgr.shape[:2]
    with open(label_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments[:3]):
            cls_id = int(labels[i])
            cx, cy, nw, nh = rect_to_yolo(seg, img_w, img_h)
            f.write("%d %.6f %.6f %.6f %.6f\n" % (cls_id, cx, cy, nw, nh))
```

本地整理的数据集中，图片数量大约是 1400 多张，标注框数量在 4000 个以上。各数字分布并不完全均衡，因为视频读数本身不是均匀变化的，`3`、`4`、`5` 这类数字出现得更多。

![数据集各数字标注框数量](/images/posts/maixcam-gas-meter/dataset-counts.png)

后面导入 MaixHub 后，再按平台流程划分训练集和验证集，并训练 YOLOv5s 模型。

![MaixHub 数据集统计](/images/posts/maixcam-gas-meter/maixhub-dataset-summary.png)

训练完成后，我主要看 loss 是否持续下降、验证集准确率是否稳定。下面这张图来自最终实验报告中的训练曲线：

![MaixHub 训练曲线](/images/posts/maixcam-gas-meter/loss-acc.png)

## 为什么不直接用 YOLO 找整块数字区域

这个问题我纠结过。理论上可以训练 YOLO 检测整块码表数字区域，也可以训练 YOLO 检测每个数字。但在这个题目里，整块数字区域的红色窗口非常明显，用传统视觉已经能较稳定地找出来。

如果把整块区域也交给 YOLO，需要额外标注窗口框，模型还要同时承担区域定位和数字识别。对 MaixCAM 这种边缘设备来说，这并不是最划算的选择。

最终我采用的是：

- `1.1` 的区域检测和居中显示：传统视觉。
- `1.2` 的单个数字识别：YOLOv5s。
- `1.3` 的反光条计数：基于最后一位数字区域做亮条状态检测。

这也是这次课设里我觉得比较重要的一个收获：AI 模型不是越多越好，能用简单规则稳定解决的部分，就不要硬上模型。

## 功能 1：码表数字区域居中显示

码表数字窗口定位主要靠红色区域检测。流程大概是：

1. 把摄像头图像转成 HSV。
2. 对红色范围做阈值分割。
3. 用闭运算连接断开的红色区域。
4. 找轮廓并按面积、宽高比、位置筛选。
5. 得到 `(x, y, w, h)` 后裁剪该区域。
6. 按 LCD 画布尺寸等比例缩放，并居中显示。

找到数字窗口时，LCD 上显示的是裁剪后的码表区域：

![码表数字区域居中显示](/images/posts/maixcam-gas-meter/effect-center-crop.png)

实际代码中，我先对红色窗口做 HSV 阈值分割，再用开运算去噪、闭运算连接断裂区域，最后按面积和宽高比筛选候选框。这里没有直接选“最大红色区域”，而是额外做了 `is_meter_layout()` 判断，避免把其他红色干扰误当成码表窗口。

```python
def red_mask(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask1 = cv2.inRange(hsv, RED1_LOW, RED1_HIGH)
    mask2 = cv2.inRange(hsv, RED2_LOW, RED2_HIGH)
    return cv2.bitwise_or(mask1, mask2)


def detect_digit_area(bgr):
    h, w = bgr.shape[:2]
    mask = red_mask(bgr)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((19, 9), np.uint8), iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    min_area = w * h * 0.004
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        if area < min_area or cw < w * 0.08 or ch < h * 0.05:
            continue
        if cw / max(1, ch) < 1.0:
            continue
        score = area + (w * h * 0.02 if y > h * 0.25 else 0)
        candidates.append((score, x, y, cw, ch))

    candidates.sort(reverse=True)
    for _, x, y, cw, ch in candidates[:5]:
        pad = max(4, int(min(cw, ch) * 0.08))
        box = (max(0, x - pad), max(0, y - pad), cw + 2 * pad, ch + 2 * pad)
        if is_meter_layout(bgr, box):
            return box
    return None
```

如果没有找到码表数字区域，就清成红屏，并显示“未找到码表数字”。这个功能即使 YOLO 模型还没有上传，也可以独立工作。

## 功能 2：YOLOv5s 数字识别

YOLO 模型部署后，主程序会加载 MaixHub 导出的 `.mud` 模型：

```python
detector = nn.YOLOv5(model=AI_DIGIT_MODEL, dual_buff=True)
```

检测结果会先过滤置信度，再按 `x` 坐标排序。这样屏幕上的数字顺序就是从左到右，而不是模型返回的随机顺序。之后程序把识别出的类别画到每个数字框的右上角。

部署推理部分的关键点，是把 MaixCAM 摄像头图像转换成模型输入格式，再过滤掉低置信度、异常尺寸以及不在码表区域内的检测框：

```python
def detect_yolo_digits(detector, bgr, box=None):
    img = image.cv2image(bgr, bgr=True, copy=True)
    img = img.to_format(detector.input_format())
    objs = detector.detect(img, conf_th=YOLO_CONF_TH, iou_th=YOLO_IOU_TH)

    frame_h, frame_w = bgr.shape[:2]
    filter_box = padded_box(box, frame_w, frame_h) if box is not None else None
    detections = []

    for obj in sorted(objs, key=yolo_object_x):
        digit = yolo_object_to_digit(detector, obj)
        rect = yolo_object_rect(obj)
        score = yolo_object_score(obj)

        if not re.match(r"^[0-9]$", digit):
            continue
        if score < YOLO_CONF_TH or rect[2] <= 2 or rect[3] <= 2:
            continue
        if filter_box is not None and not rect_center_inside(rect, filter_box):
            continue

        detections.append((rect, digit, score))
    return detections
```

这一步里我还加了一个小处理：数字识别结果不是每一帧都直接相信，而是做了简单的投票和平滑。因为摄像头拍屏幕时偶尔会有抖动、拖影和反光，如果完全按单帧结果显示，数字会跳得比较明显。

## 功能 3：最后一位反光条计数

题目要求统计最后一位数字区域的反光条转过次数。我的做法是先拿到最后一位数字区域，然后在这个局部区域里检测高亮反光条。

计数不是单纯看到亮条就加一，而是做状态变化：

- 当前亮度超过阈值，认为反光条进入“出现”状态。
- 只有从“未出现”变成“出现”时才加一。
- 加入最小时间间隔，避免同一条反光在连续多帧里重复计数。
- 当亮度回落后，状态才允许下一次触发。

运行效果如下，左上角显示 `count`，右侧框住最后一位数字区域：

![反光条计数效果](/images/posts/maixcam-gas-meter/effect-counter.png)

反光条计数的代码本质上是一个小状态机。先在最后一位数字上半部分找高亮横条，再判断它下面是否存在较暗区域，用这两个条件减少误触发。只有从 `off` 进入 `on` 时才计数，亮条消失若干帧后才允许下一次触发。

```python
def update_reflection_counter(bgr, box, segments, state):
    x, y, w, h = last_digit_segment(box, segments)
    crop = bgr[y : y + h, x : x + w]

    roi = crop[int(h * 0.02):int(h * 0.46), int(w * 0.12):int(w * 0.88)]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    bright = cv2.inRange(hsv, (0, 0, 178), (179, 92, 255))
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best_score, best_area, best_dark_under = 0.0, 0.0, 0.0

    for c in contours:
        area = cv2.contourArea(c)
        bx, by, bw, bh = cv2.boundingRect(c)
        if bw < roi.shape[1] * 0.32 or bh < roi.shape[0] * 0.12:
            continue

        under = hsv[min(roi.shape[0], by + bh):min(roi.shape[0], by + bh + 12), bx:bx + bw]
        dark_under = float(((under[:, :, 2] < 95) & (under[:, :, 1] > 35)).mean()) if under.size else 0.0
        area_score = area / max(1, roi.shape[0] * roi.shape[1])
        score = area_score * (1.0 + dark_under)
        best_score = max(best_score, score)
        best_area = max(best_area, area_score)
        best_dark_under = max(best_dark_under, dark_under)

    is_marker = (
        best_score > REFLECT_HIGH_SCORE
        and best_area > REFLECT_MIN_AREA
        and best_dark_under > REFLECT_MIN_DARK_UNDER
    )
    is_low = best_score < REFLECT_LOW_SCORE or best_area < 0.025

    now_ms = time.ticks_ms()
    if is_marker and (not state["on"]) and now_ms - state["last_ms"] > REFLECT_MIN_INTERVAL_MS:
        state["count"] += 1
        state["on"] = True
        state["last_ms"] = now_ms
    elif state["on"] and is_low:
        state["lost"] += 1
        if state["lost"] >= REFLECT_LOST_FRAMES:
            state["on"] = False
```

## 踩过的坑

这次最明显的坑是 OCR。OCR 对普通清晰文字很方便，但这类码表数字不是标准文本场景：数字在红色窗口里，存在滚动、反光、拍屏纹理和局部模糊。直接用 OCR 很容易把问题变成调参。

第二个坑是数据集。刚开始容易忽略“采集方式要和部署一致”。如果直接从视频文件截帧，画面会比 MaixCAM 实拍干净很多，模型训练出来以后到了真实摄像头画面里反而不稳定。所以后面我坚持用 MaixCAM 摄像头实拍采集。

第三个坑是标注工作量。手工一张张画框确实可以做，但很慢，而且容易因为疲劳造成框不一致。预标注脚本虽然前期多写了一点代码，但后面节省了很多重复劳动。

还有一个经验是，不要把所有功能都模型化。整块红色码表窗口用传统视觉检测就足够，模型只负责单数字识别，整个系统会更容易调试。

## 最后

这次课设的结果不算复杂，但对我来说是一次很完整的视觉入门：从 OCR 尝试失败，到理解数据集的重要性，再到自己采集、预标注、训练、部署和调试。

以前我对 YOLO 部署到 MaixCAM 的理解比较抽象，觉得只是“训练一个模型然后放到板子上”。真正做完才发现，模型只是其中一环，前面的数据采集、标注策略、输入尺寸一致性，后面的显示逻辑、结果排序、状态计数，同样会决定最终效果。

如果以后再做类似项目，我会更早地把任务拆开：哪些适合传统视觉，哪些适合模型，哪些只是工程上的状态机。这样会比一开始就把所有东西交给 AI 更稳。
