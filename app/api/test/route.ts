// app/api/products/route.ts
import { prisma } from '@/prisma/prisma';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/products
export async function GET(request: NextRequest) {

  const products = await prisma.user.findMany({
    include: {
      contacts_contacts_userTouser: true,
    }
  });

  return NextResponse.json(products);
}

// POST /api/products
// export async function POST(request: NextRequest) {
//   const body = await request.json();

//   if (!body.name) {
//     return NextResponse.json(
//       { error: 'name is required' },
//       { status: 400 }
//     );
//   }

//   const product = await prisma.product.create({
//     data: { name: body.name, price: body.price },
//   });

//   return NextResponse.json(product, { status: 201 });
// }   