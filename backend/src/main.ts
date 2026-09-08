process.env.TZ = 'Asia/Dhaka';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './config/cors-origins';
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
   * Only the shop's own front ends may call this API. The allowlist comes from
   * CORS_ORIGINS — see src/config/cors-origins.ts for the rules, including the
   * wildcard that covers preview deployments.
   */
  const cors = resolveCorsOrigins();
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // No Origin header at all: a server-to-server caller such as the print
      // bridge, or curl. CORS is a browser mechanism and has nothing to say
      // about these, so they pass through untouched.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, cors.isAllowed(origin));
    },
    credentials: true,
  });
  console.log(`CORS allows: ${cors.configured.join(', ')}`);

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
