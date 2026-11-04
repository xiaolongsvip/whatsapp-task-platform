import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: [
      process.env.WEB_ORIGIN ?? "http://localhost:3000",
      process.env.ADMIN_ORIGIN ?? "http://localhost:3001",
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3002);
  await app.listen(port, "0.0.0.0");
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
