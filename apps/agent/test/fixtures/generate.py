"""Regenerate fictional document fixtures; requires Pillow, reportlab and python-docx.
The resulting files are committed fixtures, not generated during the Node test suite.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from docx import Document

root = Path(__file__).resolve().parent
lines = [
    'Alex Chen',
    'Frontend Engineer',
    'alex@example.com | +1 555 0100',
    '',
    'Experience',
    'Example Lantern Lab | Engineer | 2022 - 2024',
    'Implemented accessible forms and input validation.',
    'Documented component behavior and tested keyboard navigation.',
    '',
    'Education',
    'Example Meadow College | Computing | 2018 - 2022',
    '',
    'Project',
    'Example booking page | Coursework | 2021',
    'Built and tested form validation in a student team.',
    '',
    'Skills',
    'HTML, CSS, TypeScript',
]
text = '\n'.join(lines) + '\n'
(root / 'resume.txt').write_text(text)
(root / 'resume.md').write_text('# Alex Chen\n\n' + '\n'.join(lines[1:]) + '\n')
image = Image.new('RGB', (1000, 1300), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=22)
heading = ImageFont.load_default(size=34)
for index, line in enumerate(lines):
    draw.text((55, 50 + index * 51), line, fill='#15202b', font=heading if index == 0 else font)
for ext, fmt in [('png', 'PNG'), ('jpeg', 'JPEG'), ('webp', 'WEBP')]:
    image.save(root / f'resume.{ext}', format=fmt)
for name, scanned, pages in [('resume.pdf', False, 1), ('scanned.pdf', True, 1),
                             ('over-page-limit.pdf', False, 21), ('over-vision-limit.pdf', True, 6)]:
    pdf = canvas.Canvas(str(root / name), pagesize=(600, 780), invariant=1)
    pdf.setTitle('Fictional resume fixture')
    pdf.setAuthor('Example Fixture Generator')
    for page in range(pages):
        if scanned:
            pdf.drawImage(ImageReader(image), 0, 0, width=600, height=780)
        else:
            for index, line in enumerate(lines):
                pdf.setFont('Helvetica-Bold' if index == 0 else 'Helvetica', 18 if index == 0 else 11)
                pdf.drawString(34, 740 - index * 31, line)
        pdf.showPage()
    pdf.save()
doc = Document()
doc.core_properties.author = 'Example Fixture Generator'
doc.core_properties.last_modified_by = 'Example Fixture Generator'
for line in lines:
    doc.add_paragraph(line)
doc.save(root / 'resume.docx')
