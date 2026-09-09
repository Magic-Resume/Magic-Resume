#!/usr/bin/env python3
"""把一款完整 CJK 字体做成可嵌入 PDF 的子集 woff2。

和 subset-fonts.mjs 的分工：那个脚本处理**随仓库提交完整源**的三款老字体
（思源黑/思源宋/霞鹜文楷,它们的 full/ 还兼作生僻字回退资源）；这个脚本处理
后加的字体——源文件不进仓库（见 .font-src/），只提交子集产物。

顺序是**先子集、再 CFF 化**,不是反过来：
  · fontkit@2.0.4 的 glyf 子集路径对复杂汉字有 bug,所以最终必须是 CFF
    （详见 docs/specs/kaiti-pdf-fontkit/）。
  · 但 CFF 化要逐字重绘轮廓,对一款一万五千字的全量字体极慢；先砍到 8420 字
    再转,快一个量级,结果完全一样。
源本来就是 CFF(OTF/OTTO)的直接跳过转换。

    python3 scripts/build-cjk-font.py <源文件> <输出名.woff2>
    python3 scripts/build-cjk-font.py <源文件> <输出名.woff2> --chars 字Aa

`--chars` 用来切**预览用的微型子集**(几 KB):字体选择器要显示每款字体的样子,但
用整包去画一个字等于把下载闸门绕过去——@font-face 会为了那个字把 3–11MB 全拉下来。
所以预览另走一份只含那几个字的子集。
"""
import sys, os, argparse
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "public", "fonts")


def load_charset(explicit=None):
    text = explicit if explicit else open(os.path.join(HERE, "charset.txt"), encoding="utf8").read()
    return {c for c in text if not c.isspace()}


def subset_font(src, chars):
    font = TTFont(src, fontNumber=0)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ["FFTM"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    return font


def to_cff(font):
    """把 glyf 轮廓逐字重绘成 CFF charstring。源已是 CFF 时原样返回。"""
    if "CFF " in font or "CFF2" in font:
        return font

    glyph_order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]
    name = font["name"]
    family = name.getDebugName(1) or "Font"
    subfamily = name.getDebugName(2) or "Regular"
    ps_name = (name.getDebugName(6) or family).replace(" ", "")

    charstrings, metrics = {}, {}
    for gname in glyph_order:
        width, _ = hmtx[gname]
        pen = T2CharStringPen(width, glyph_set)
        glyph_set[gname].draw(pen)
        charstrings[gname] = pen.getCharString()
        bpen = BoundsPen(glyph_set)
        glyph_set[gname].draw(bpen)
        metrics[gname] = (width, int(round(bpen.bounds[0])) if bpen.bounds else 0)

    fb = FontBuilder(font["head"].unitsPerEm, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(font.getBestCmap())
    fb.setupCFF(ps_name, {"FullName": name.getDebugName(4) or family,
                          "FamilyName": family, "Weight": subfamily}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    hhea = font["hhea"]
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent,
                             lineGap=hhea.lineGap)
    fb.setupNameTable({"familyName": family, "styleName": subfamily,
                       "fullName": name.getDebugName(4) or family,
                       "psName": ps_name,
                       "version": name.getDebugName(5) or "Version 1.0"})
    os2 = font.get("OS/2")
    fb.setupOS2(sTypoAscender=getattr(os2, "sTypoAscender", hhea.ascent),
                sTypoDescender=getattr(os2, "sTypoDescender", hhea.descent),
                sTypoLineGap=getattr(os2, "sTypoLineGap", 0),
                usWinAscent=getattr(os2, "usWinAscent", hhea.ascent),
                usWinDescent=getattr(os2, "usWinDescent", abs(hhea.descent)),
                usWeightClass=getattr(os2, "usWeightClass", 400),
                fsType=getattr(os2, "fsType", 0))
    fb.setupPost()
    return fb.font


def normalize_weight_class(font, out_name):
    """让文件里的 usWeightClass 与「我们把它注册成哪一档」一致。

    两边的合成粗体都不看声明、只看**字体文件自己的 usWeightClass**:
      · 浏览器(Blink):usWeightClass ≥600 就认为这个 face 已经是粗体,不再合成。
        秋水书体的源标的正是 600,于是 `.wysiwyg strong` 的 900 完全失效,
        富文本里的 <strong> 与正文逐像素相同。
      · PDF:我们给 @react-pdf/render 打的 patch 用同一条判据决定要不要描边
        (patches/@react-pdf__render@4.5.1.patch)。

    所以文件必须说实话,否则两端会在不同的字体上合成,屏幕和导出就漂移:
      · Regular 产物注册成 400 → 压到 400,让 700/900 落空,两端都合成;
      · -Bold / -Medium 产物是当粗体注册的 → 抬到 700,两端都不再合成
        (霞鹜文楷 Medium 原本标 400、霞鹜漫黑 Medium 标 500,不抬的话
         PDF 会在真 Medium 之上再描一层边,比屏幕更粗)。
    """
    os2 = font.get("OS/2")
    if os2 is None:
        return None
    want = 700 if ("-Bold" in out_name or "-Medium" in out_name) else 400
    was = os2.usWeightClass
    if (want == 400 and was < 600) or (want == 700 and was >= 600):
        return None
    os2.usWeightClass = want
    return was


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--chars", default=None, help="只保留这几个字(预览用的微型子集)")
    args = ap.parse_args()

    chars = load_charset(args.chars)
    src_size = os.path.getsize(args.src)
    font = subset_font(args.src, chars)
    had_cff = "CFF " in font or "CFF2" in font
    font = to_cff(font)
    retagged = normalize_weight_class(font, args.out)
    weight_now = font["OS/2"].usWeightClass if "OS/2" in font else None
    font.flavor = "woff2"
    out_path = os.path.join(OUT_DIR, args.out)
    font.save(out_path)
    out_size = os.path.getsize(out_path)
    print(f"{os.path.basename(args.src):<38} {src_size/1048576:6.1f}MB -> "
          f"{args.out:<34} {out_size/1048576:5.2f}MB  "
          f"({'CFF 源' if had_cff else 'glyf→CFF'})"
          f"{f'  usWeightClass {retagged}→{weight_now}' if retagged else ''}")


if __name__ == "__main__":
    main()
