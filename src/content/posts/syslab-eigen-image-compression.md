---
title: 用 Syslab 做一个特征值图像压缩 App
published: 2026-06-06
description: "记录《电子学智能科学计算技术》期末大作业：在 MWorks.Syslab AppDesigner 中完成一个基于特征值分解的图像压缩 GUI，并整理实现过程中的算法取舍与踩坑。"
tags: ["MWorks.Syslab", "Julia", "图像压缩", "特征值分解", "课程设计"]
category: 项目实战
draft: false
image: /images/posts/syslab-eigen-image-compression/cover.png
lang: zh-CN
---

## 写在前面

这次《电子学智能科学计算技术》的期末大作业，要求用 MWorks.Syslab 的 GUI 设计平台做一个图像压缩界面：左侧显示输入图像，右侧显示压缩重建后的图像，中间用数值编辑框控制保留特征值的比例，点击“执行”后完成裁剪、计算和显示。

我最后把它做成了一个 Syslab AppDesigner 工程，核心文件放在 `final/EigenImageCompressionApp` 下：

- `app.jl`：界面、回调函数和图像压缩逻辑。
- `app.slapp`：AppDesigner 工程文件。
- `verify_core.jl`：用于验证语法、特征值压缩核心逻辑和图像写出。

这篇文章不按报告格式复述，而是把这次作业当成一次小项目复盘：从界面怎么搭、算法怎么落地，到为什么有些地方看起来简单但实际很容易卡住。

![不同保留比例下的特征值重建效果](/images/posts/syslab-eigen-image-compression/evd-comparison.png)

## 题目拆解

题目看起来是一个 GUI 作业，但真正要完成的事情可以拆成三层。

第一层是界面。需要两个图像显示区域、一个比例输入框和一个执行按钮。为了使用上更顺手，我额外加了“选择图像”按钮，并让输入图像区域也能点击选图。

第二层是预处理。输入图像可能不是正方形，而特征值分解这里更适合对方阵处理，所以需要先把图像居中裁剪成长宽一致的正方形，再转成灰度矩阵。

第三层是压缩重建。对灰度矩阵做特征值分解，按特征值绝对值排序，保留前 `ceil(ratio * n)` 个特征值，其余特征值置零，然后重建矩阵并显示结果。

界面布局大致如下：

![Syslab App 界面布局示意图](/images/posts/syslab-eigen-image-compression/ui-layout-diagram.png)

## 为什么用特征值分解压缩图像

图像本质上可以看成一个矩阵。灰度图的每个像素值对应矩阵中的一个元素，值越大越亮，值越小越暗。对一个方阵 $A$ 做特征值分解，可以写成：

$$
A = V \Lambda V^{-1}
$$

其中 $\Lambda$ 是由特征值组成的对角矩阵，$V$ 是特征向量矩阵。如果只保留一部分“贡献更大”的特征值，把其余特征值置零，再用同样的形式重建，就能得到一个近似图像。

这不是最实用的现代图像压缩方式。真正工程中常见的是 JPEG、WebP、HEIF 这类编码格式，或者用 SVD 做低秩近似会更稳定。但这次作业的重点是“科学计算”和“GUI 操作界面”，用特征值分解能很直观地把线性代数计算和图像显示连起来。

实现里我用的是：

```julia
factors = eigen(matrix)
values = factors.values
vectors = factors.vectors
order = sortperm(abs.(values), rev=true)
kept = order[1:keep_count]

compressed_values = zeros(eltype(values), length(values))
compressed_values[kept] = values[kept]

reconstructed = vectors * diagm(compressed_values) / vectors
reconstructed = real.(reconstructed)
```

这里有一个细节：普通图像矩阵不一定是对称矩阵，特征值和特征向量可能会出现复数。因此重建后我取了实部，并把像素值限制在 `[0, 1]` 区间内，避免显示时出现越界。

## 图像预处理

用户选进来的图可能是横图，也可能是竖图。为了保证后续矩阵是方阵，我没有直接缩放成正方形，而是选择居中裁剪。

这样做的好处是不会改变图像内容的比例。缺点也很明显：如果主体不在中间，边缘内容可能会被切掉。不过对这次作业来说，要求本身就是“通过裁剪让长宽保持一致”，所以居中裁剪是最直接的选择。

输入图像示例：

![输入原图](/images/posts/syslab-eigen-image-compression/evd-sample-original.png)

裁剪后的正方形图像：

![居中裁剪后的输入图](/images/posts/syslab-eigen-image-compression/evd-sample-crop.png)

核心逻辑比较简单：取宽高的较小值作为正方形边长，然后从中心区域截取。

```julia
function center_crop_square(app, img)
    height = size(img, 1)
    width = size(img, 2)
    side = min(height, width)

    top = Int(floor((height - side) / 2)) + 1
    left = Int(floor((width - side) / 2)) + 1

    return img[top:top + side - 1, left:left + side - 1, :]
end
```

## GUI 实现

这次不是单独写一个外部 Python 或 PyQt 程序，而是尽量贴合题目要求，使用 Syslab AppDesigner 的 Julia GUI API。

界面中主要有这些控件：

- `InputImage`：显示输入图像。
- `OutputImage`：显示压缩重建结果。
- `RetainRatioEditField`：输入保留特征值比例。
- `SelectImageButton`：选择图像文件。
- `ExecuteButton`：执行压缩和重建。

按钮回调只做调度，真正的处理过程封装在 `process_image(app)` 里。这样界面事件和算法逻辑不会混在一起，后面调试时也方便单独验证核心计算。

```julia
function ExecuteButtonPushed(app, event)
    app.process_image()
end
```

处理流程是：

1. 读取用户选择的图像路径。
2. 获取保留特征值比例，并限制在 `0.001` 到 `1` 之间。
3. 居中裁剪为正方形。
4. 转成灰度浮点矩阵。
5. 做特征值分解压缩和重建。
6. 把裁剪图与重建图写入临时文件。
7. 更新左右两个图像控件的 `ImageSource`。

之所以把中间结果写成临时图片，是因为 GUI 的 `ImageSource` 接收图片路径最稳定。虽然看起来多了一步磁盘写入，但对课程作业的交互规模来说足够直接。

重建效果示例：

![压缩重建后的图像](/images/posts/syslab-eigen-image-compression/evd-sample-reconstruction.png)

## 保留比例带来的变化

保留比例越低，重建图越模糊，细节越容易丢失；保留比例越高，图像越接近原图，但压缩意义也越弱。

我在测试时主要试了这些比例：

- `0.05`：能看到大致结构，但细节损失明显。
- `0.10`：轮廓基本可辨，局部纹理开始恢复。
- `0.25`：整体观感已经比较稳定。
- `0.50`：和原图差距进一步缩小。
- `1.00`：理论上接近完整重建。

这个过程挺适合做课堂展示，因为滑动比例或者改数值后，图像质量变化很直观。线性代数里的“保留主成分”不再只是公式，而是能马上体现在图像上。

## 踩过的坑

第一个坑是 AppDesigner 的工程格式。`.slapp` 文件不只是普通脚本，里面还包含布局、控件、回调和工程元数据。刚开始如果只写 `app.jl`，逻辑能看懂，但不一定能像正常 App 工程一样打开和运行。后面我参考了 Syslab 自带示例，才把 `app.jl` 和 `app.slapp` 都生成出来。

第二个坑是图像矩阵类型。彩色图、灰度图、浮点矩阵和显示控件需要的图片路径是几种不同形式。代码里必须把“用于计算的矩阵”和“用于显示的图片文件”分清楚，否则很容易在某一步类型不匹配。

第三个坑是特征值分解的数值结果。非对称矩阵可能产生复数结果，所以重建后不能直接当作图像写出。取实部、截断到合法像素范围这些步骤虽然不复杂，但少一步都会导致显示异常。

第四个坑是验证。GUI 程序如果只靠手点，很难判断问题是在界面、文件选择、图像读写还是算法本身。于是我单独写了 `verify_core.jl`，先验证 `app.jl` 能解析，再用一个小矩阵跑压缩逻辑，最后测试图像能否写出。

验证输出是：

```text
app.jl parse ok
core eigen compression ok
image write ok
```

这个小脚本很有用。它不能替代完整 GUI 测试，但能先把核心算法和环境问题排掉。

## 最后的感受

这次大作业最有收获的地方，不是写出了多复杂的算法，而是把一个课本里的矩阵分解过程做成了可操作、可观察的界面。

以前看特征值分解，更多是在公式层面理解。真正把图像读进来、裁剪成矩阵、保留部分特征值、再重建显示出来之后，才会更直观地感受到：数学对象和工程对象之间还有很多转换工作。矩阵计算只是中间一环，前后的数据格式、边界条件、GUI 回调和验证流程，同样会影响最终结果。

如果以后继续改这个项目，我会优先做两件事：一是增加不同保留比例下的 PSNR 或误差曲线，让结果不只靠肉眼比较；二是补一个 SVD 版本，和特征值分解放在同一个界面里对比。这样这份作业就不只是“完成要求”，还能变成一个更完整的图像矩阵分解演示工具。
