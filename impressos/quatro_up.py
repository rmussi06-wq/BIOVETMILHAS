import pikepdf
from pikepdf import Name, Dictionary, Array

SRC = '/root/.claude/uploads/b6d04f11-a052-5145-b208-d620d309673d/9e4b131f-diadoveterinarioA4.pdf'
OUT = 'diadoveterinario-A4-4porfolha.pdf'

# A4 retrato
PW, PH = 595.2756, 841.8898
HW, HH = PW / 2, PH / 2

# Layout original (2-up em A4 paisagem) reduzido em 1/raiz(2) -> encaixe exato em cada quadrante A6
IW, IH = 272.7834, 400.8760          # tamanho da imagem
MX, MY = (HW - IW) / 2, (HH - IH) / 2  # margens dentro do quadrante

src = pikepdf.open(SRC)
spage = src.pages[0]
img_name, img_obj = next(iter(spage.Resources.XObject.items()))

pdf = pikepdf.new()
img = pdf.copy_foreign(img_obj)

ops = ['1 0 0 1 0 0 cm']
for x in (MX, HW + MX):
    for y in (MY, HH + MY):
        ops.append(f'q\n{IW:.4f} 0 0 {IH:.4f} {x:.4f} {y:.4f} cm\n{img_name} Do\nQ')

# linhas de corte tracejadas (mesmo estilo do arquivo original)
ops.append('.72 .72 .72 RG')
ops.append('.3 w')
ops.append('[3 4] 0 d')
ops.append(f'n {HW:.4f} 0 m {HW:.4f} {PH:.4f} l S')
ops.append(f'n 0 {HH:.4f} m {PW:.4f} {HH:.4f} l S')

content = pdf.make_stream('\n'.join(ops).encode('latin1'))
page = pdf.add_blank_page(page_size=(PW, PH))
page.Contents = content
page.Resources = Dictionary(XObject=Dictionary(**{str(img_name)[1:]: img}))

pdf.save(OUT, compress_streams=True)
print('ok')
