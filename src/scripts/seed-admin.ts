import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const name = process.env.ADMIN_NAME || 'Admin User';

  try {
    const existingUser = await usersService.findByEmail(email);
    if (existingUser) {
     
      // Verify password works, if not, update it
      try {
        const isValid = await usersService.validatePassword(existingUser, password);
        if (!isValid) {
          console.log('Password verification failed, updating password...');
          const hashedPassword = await argon2.hash(password);
          await usersService.update(existingUser._id.toString(), {
            password: hashedPassword,
            isActive: true,
          } as any);
          console.log('Password updated successfully!');
        } else {
          console.log('Password verification passed ✓');
        }
      } catch (error) {
        console.log('Password verification error, updating password...');
        const hashedPassword = await argon2.hash(password);
        await usersService.update(existingUser._id.toString(), {
          password: hashedPassword,
          isActive: true,
        } as any);
        console.log('Password updated successfully!');
      }
      process.exit(0);
    }

    const hashedPassword = await argon2.hash(password);
    await usersService.create({
      email,
      password: hashedPassword,
      name,
      role: 'admin' as any,
    });

    console.log('Admin user created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('\n⚠️  Please change the default password after first login!');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
