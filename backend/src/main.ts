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

  /**
   * Only the shop's own front ends may call this API.
   *
   * `origin: true` reflected whatever origin asked, which let any website on
   * the internet make browser requests against a deployment. The allowlist
   * comes from CORS_ORIGINS (comma-separated); with nothing set it stays on
   * localhost, so a deployment that forgets the variable fails visibly in the
   * browser instead of being quietly open to everyone.
   */
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = allowedOrigins.length
    ? allowedOrigins
    : ['http://localhost:5001', 'http://localhost:3001'];
  app.enableCors({ origin: origins, credentials: true });
  console.log(`CORS allows: ${origins.join(', ')}`);

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

  const port = process.env.PORT ?? 5000;
  await app.listen(port);

  console.log(
    `Shop POS backend running on http://localhost:${port} (docs at /docs)`,
  );
}
void bootstrap();
