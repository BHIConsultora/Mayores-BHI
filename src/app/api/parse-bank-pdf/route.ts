import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { parseBankStatementText } from '@/core/banks';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bankId = (formData.get('bankId') as string | null) || 'auto';

    if (!file) {
      return NextResponse.json(
        { error: 'No se envió ningún archivo PDF.' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'El archivo seleccionado debe ser un documento PDF.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Extract text using pdf-parse
    const parser = new PDFParse(buffer);
    const parsedPdf = await parser.getText();

    const fullText = parsedPdf.text || '';
    const pages = (parsedPdf.pages || []).map((p: any, idx: number) => ({
      text: p.text || '',
      num: p.num || idx + 1
    }));

    if (!fullText.trim()) {
      return NextResponse.json(
        {
          error:
            'No se pudo extraer texto del PDF. Es posible que el archivo sea una imagen escaneada sin capa de texto digital.'
        },
        { status: 422 }
      );
    }

    // Process using bank parser engine
    const result = parseBankStatementText(fullText, pages, {
      selectedBankId: bankId
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error procesando extracto bancario PDF:', error);
    return NextResponse.json(
      {
        error: error.message || 'Ocurrió un error inesperado al procesar el archivo PDF.'
      },
      { status: 500 }
    );
  }
}
