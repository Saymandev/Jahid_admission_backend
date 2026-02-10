import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

const expressApp = express();
const adapter = new ExpressAdapter(expressApp);

let app;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule, adapter);

    // Security headers
    app.use(helmet());

    // CORS
    app.enableCors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Global prefix
    // Note: Vercel might handle routing differently, but keeping 'api' is safe if we route /api/* to this function
    app.setGlobalPrefix('api');

    await app.init();
  }
  return expressApp;
}

export default async (req, res) => {
  const instance = await bootstrap();
  instance(req, res);
};
