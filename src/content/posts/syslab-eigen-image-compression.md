---
title: 用 Syslab 做一个特征值图像压缩 App
published: 2026-06-06
description: "记录《电子学智能科学计算技术》期末大作业：我在 MWorks.Syslab AppDesigner 里做了一个基于特征值分解的图像压缩 GUI。"
tags: ["MWorks.Syslab", "Julia", "图像压缩", "特征值分解", "课程设计"]
category: 项目实战
draft: false
image: /images/posts/syslab-eigen-image-compression/cover.png
lang: zh-CN
---

## 写在前面

这次《电子学智能科学计算技术》的期末大作业，我做的是一个基于特征值分解的图像压缩 App。

题目要求其实很明确：用 MWorks.Syslab 的 GUI 设计平台做一个界面，左边显示输入图像，右边显示压缩重建图像，中间有一个数值编辑框用来设置“保留特征值比重”，点“执行”之后完成整体计算。输入图像还要先裁剪成长宽一致，再继续后面的压缩。

一开始我以为这会是一个“把算法写出来，再拖几个控件”的作业。真正做的时候才发现，麻烦的地方反而不全在算法：Syslab AppDesigner 的工程格式、图片读写、GUI 控件回调、临时文件显示、矩阵类型转换，这些细节每一个都能卡一下。

最后我把工程放在了 `final/EigenImageCompressionApp` 里面，主要文件是：

- `app.jl`：App 的界面、回调和核心算法。
- `app.slapp`：Syslab AppDesigner 工程文件。
- `verify_core.jl`：我用来验证核心逻辑的小脚本。

这篇就不按课程报告那种格式写了，主要记录一下我是怎么把它做出来的。

![不同保留比例下的特征值重建效果](/images/posts/syslab-eigen-image-compression/evd-comparison.png)

## 我先把任务拆开

我做之前先把题目拆成了三件事。

第一件事是界面。题目要求两个图像框、一个数值输入框和一个执行按钮。我自己又加了一个“选择图像”按钮，并且让左侧输入图像框也能点击选图，这样用起来更自然。

第二件事是预处理。因为后面要做特征值分解，我希望输入给算法的是一个方阵，所以图像进来之后先做居中裁剪，把横图或竖图裁成正方形，再转成灰度矩阵。

第三件事才是压缩。对灰度矩阵做特征值分解，按特征值绝对值从大到小排序，只保留前面一部分特征值，剩下的置零，再重建图像。

界面大概长这样：

![Syslab App 界面布局示意图](/images/posts/syslab-eigen-image-compression/ui-layout-diagram.png)

## 选图：先把输入路径存下来

我没有把文件选择逻辑写进“执行”按钮里，而是单独做了一个 `choose_image(app)`。这样点击左侧图片框和点击“选择图像”按钮都可以复用同一段逻辑。

```julia
function choose_image(app)
    file = uigetfile("", "选择输入图像")
    if isempty(file)
        return
    end

    app.InputFilePicker.Value = file
    app.InputImage.ImageSource = file
    app.OutputImage.ImageSource = raw""
    app.StatusLabel.Text = "已加载图像：" * file
end
```

这里我用了一个隐藏的 `InputFilePicker` 来存路径。左侧 `InputImage` 负责显示图像，隐藏控件负责保存原始文件位置。这样后面点“执行”的时候，不需要从图像控件里反推路径。

对应的回调也很短：

```julia
function InputImageClickedFcn(app, event)
    app.choose_image()
end

function SelectImageButtonPushed(app, event)
    app.choose_image()
end
```

这个地方看起来很小，但我觉得 GUI 程序里这种拆分很重要。按钮回调越薄，后面越容易查问题。

## 裁剪：先变成正方形

题目里明确说输入图像要通过裁剪让长宽保持一致，所以我没有做拉伸缩放，而是取中心区域裁剪。

输入原图：

![输入原图](/images/posts/syslab-eigen-image-compression/evd-sample-original.png)

裁剪之后：

![居中裁剪后的输入图](/images/posts/syslab-eigen-image-compression/evd-sample-crop.png)

裁剪函数如下：

```julia
function center_crop_square(app, img)
    dims = size(img)
    height = dims[1]
    width = dims[2]
    side = min(height, width)

    row_start = Int(floor((height - side) / 2)) + 1
    col_start = Int(floor((width - side) / 2)) + 1
    rows = row_start:(row_start + side - 1)
    cols = col_start:(col_start + side - 1)

    if length(dims) >= 3
        return img[rows, cols, :]
    end

    return img[rows, cols]
end
```

这里我额外判断了 `length(dims)`。如果是彩色图，就保留第三维通道；如果已经是灰度图，就直接裁二维矩阵。否则同一段代码遇到灰度图时会出问题。

## 灰度化：把图像变成可以计算的矩阵

特征值分解需要的是矩阵。彩色图有 RGB 三个通道，我这里先把它转成灰度图，再归一化到 `[0, 1]`。

```julia
function image_to_gray_float(app, img)
    pixel_type = eltype(img)

    if length(size(img)) >= 3 && size(img, 3) >= 3
        r = float.(img[:, :, 1])
        g = float.(img[:, :, 2])
        b = float.(img[:, :, 3])
        gray = 0.2989 .* r .+ 0.5870 .* g .+ 0.1140 .* b
    else
        gray = float.(img)
    end

    if pixel_type <: Unsigned
        return gray ./ float(typemax(pixel_type))
    end

    max_value = maximum(gray)
    if max_value > 1
        return gray ./ 255.0
    end

    return gray
end
```

我这里用了常见的 RGB 加权方式：红色 `0.2989`、绿色 `0.5870`、蓝色 `0.1140`。人眼对绿色更敏感，所以绿色权重大一些。

后面的归一化也不能省。图片读出来可能是 `UInt8`，范围是 `0-255`；也可能已经是浮点数。直接拿不同范围的数据去重建，显示效果会不稳定。

## 核心：保留一部分特征值

真正的压缩逻辑在 `compress_with_eigen(app, gray, ratio)` 里。

思路是这样的：假设灰度矩阵是 $A$，特征值分解可以写成：

$$
A = V \Lambda V^{-1}
$$

我把所有特征值按绝对值排序，只保留前 `ceil(ratio * n)` 个，其余特征值置零。这样重建出来的矩阵就是原图的一个近似版本。

```julia
function compress_with_eigen(app, gray, ratio)
    matrix = Matrix{Float64}(gray)
    n = size(matrix, 1)
    keep_count = max(1, min(n, Int(ceil(ratio * n))))

    factors = eigen(matrix)
    values = factors.values
    vectors = factors.vectors
    order = sortperm(abs.(values), rev=true)
    kept = order[1:keep_count]

    compressed_values = zeros(eltype(values), length(values))
    compressed_values[kept] = values[kept]

    reconstructed = vectors * diagm(compressed_values) / vectors
    reconstructed = real.(reconstructed)

    return map(value -> app.clamp01(value), reconstructed), keep_count, n
end
```

这里有两个我一开始容易忽略的点。

第一个是 `keep_count` 至少要是 1，而且不能超过矩阵尺寸。否则比例太小或用户输入边界值时，很容易出现空索引或者越界。

第二个是 `reconstructed = real.(reconstructed)`。普通图像矩阵不一定是对称矩阵，特征值分解以后可能出现复数。图像显示不需要复数部分，所以我最后取实部。

为了避免像素越界，我又写了一个很简单的截断函数：

```julia
function clamp01(app, value)
    if isnan(value)
        return 0.0
    elseif value < 0
        return 0.0
    elseif value > 1
        return 1.0
    end

    return value
end
```

这一步不算高级，但很实用。没有它的话，重建后的矩阵可能出现小于 0 或大于 1 的值，写成图像时就可能显示异常。

## 执行按钮：把整条流程串起来

最后的 `process_image(app)` 就是把前面的步骤串起来。

```julia
function process_image(app)
    source_path = app.InputFilePicker.Value
    if isempty(source_path) || !isfile(source_path)
        errordlg("请先选择一幅输入图像。", "缺少输入")
        return
    end

    ratio = app.RetainRatioEditField.Value
    if ratio <= 0 || ratio > 1
        errordlg("保留特征值比重必须位于 (0, 1]。", "参数错误")
        return
    end

    img = imread(source_path)
    if img isa Tuple
        img = img[1]
    end

    cropped = app.center_crop_square(img)
    gray = app.image_to_gray_float(cropped)
    reconstructed, keep_count, matrix_size =
        app.compress_with_eigen(gray, ratio)

    crop_path = joinpath(tempdir(), "syslab_evd_input_square.png")
    output_path = joinpath(tempdir(), "syslab_evd_reconstruction.png")
    imwrite(cropped, crop_path)
    imwrite(reconstructed, output_path)

    app.InputImage.ImageSource = crop_path
    app.OutputImage.ImageSource = output_path
    app.StatusLabel.Text =
        "完成：裁剪为 $(matrix_size)x$(matrix_size)，保留 $(keep_count)/$(matrix_size) 个特征值。"
end
```

我这里没有直接把矩阵塞回图像控件，而是先把裁剪图和重建图写到临时目录，再让 `ImageSource` 指向这两个文件。这个方案比较朴素，但在 Syslab 的 GUI 里很稳。

压缩重建效果如下：

![压缩重建后的图像](/images/posts/syslab-eigen-image-compression/evd-sample-reconstruction.png)

## 比例调起来很直观

这个 App 最适合观察的地方就是保留比例。

我测试时主要试了这些数值：

- `0.05`：大结构还能看出来，但细节损失明显。
- `0.10`：轮廓比较清楚，纹理开始恢复。
- `0.25`：整体观感已经比较稳定。
- `0.50`：和原图差距进一步缩小。
- `1.00`：接近完整重建。

这也是我觉得这个作业有意思的地方。特征值分解在课本上是公式，放进图像里以后，就能很直接地看到“保留多少信息”和“画面质量”之间的关系。

## 我踩到的几个坑

第一个坑是 `.slapp`。我一开始以为有 `app.jl` 就差不多了，后来发现 AppDesigner 工程不只是脚本，还包含布局、控件、回调和一些元数据。最后我是参考 Syslab 自带示例，把 `app.jl` 和 `app.slapp` 都整理出来，才更像一个完整工程。

第二个坑是图像类型。彩色图、灰度图、`UInt8`、浮点矩阵、GUI 显示路径，这几个东西不能混为一谈。算法要的是矩阵，控件要的是图片路径，中间转换必须写清楚。

第三个坑是非对称矩阵的特征值分解。图像矩阵不是专门构造出来的对称矩阵，重建时出现复数并不奇怪。这个问题如果不处理，后面写图像就容易出异常。

第四个坑是验证。GUI 程序只靠手点很难判断问题在哪，所以我单独写了一个 `verify_core.jl`，不打开界面也能检查核心逻辑。

```julia
code = read(joinpath(@__DIR__, "app.jl"), String)
Meta.parseall(code)

img = reshape(range(0, 1, length=64), 8, 8)
reconstructed, keep_count, matrix_size = compress_with_eigen(img, 0.25)

@assert size(reconstructed) == (8, 8)
@assert keep_count == 2
@assert matrix_size == 8
@assert minimum(reconstructed) >= 0
@assert maximum(reconstructed) <= 1
```

验证通过时会输出：

```text
app.jl parse ok
core eigen compression ok
image write ok
```

这个脚本不算复杂，但帮我把“算法本身有没有问题”和“GUI 有没有问题”分开了。

## 最后的感受

这次作业对我来说，不只是完成了一个界面，而是把线性代数、图像处理和 GUI 工程串到了一起。

以前看特征值分解，更多是在公式层面理解。真正做成 App 之后，我才更明显地感觉到，数学计算只是中间一环。前面要处理输入图像，后面要考虑显示方式，中间还要处理类型、边界值和错误提示。

如果以后继续改这个项目，我想加两个东西。一个是 PSNR 或误差曲线，让不同保留比例的效果不只靠肉眼判断；另一个是加一个 SVD 版本，放在同一个界面里和特征值分解对比。这样它就不只是一个期末作业，而是一个更完整的图像矩阵分解演示工具。
