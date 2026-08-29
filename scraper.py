# quick_test.py
import requests
import PyPDF2
from io import BytesIO

url = "https://webbackend.daffodilvarsity.edu.bd/download-file/4148"
response = requests.get(url)
pdf = PyPDF2.PdfReader(BytesIO(response.content))

for i, page in enumerate(pdf.pages[:3]):
    text = page.extract_text()
    print(f"Page {i+1}:")
    print(text[:500])
    print("-" * 50)
