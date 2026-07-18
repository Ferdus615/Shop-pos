process.env.TZ = 'Asia/Dhaka';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { runSeeder } from './seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  try {
    console.log('Checking database seeds...');
    await runSeeder(app); // Pass the app context if your seed script needs Nest services
    console.log('Database seeding completed or already up to date!');
  } catch (error) {
    console.error('Seeding failed but continuing startup:', error);
  }

  // Allow the (future) Next.js frontend to call the API.
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 on unknown properties
      transform: true, // coerce payloads into DTO types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Shop POS API')
    .setDescription('POS, menu management, sales tracking and expense tracking')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(
    `Shop POS backend running on http://localhost:${port} (docs at /docs)`,
  );
}
void bootstrap();
