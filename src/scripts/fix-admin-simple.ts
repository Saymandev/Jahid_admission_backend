import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import * as argon2 from 'argon2';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../users/schemas/user.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const email = 'admin@example.com';
  const password = 'admin123';
  const name = 'Admin User';

  try {
    // Get the user model directly
    const userModel = app.get(getModelToken(User.name));
    
    // Delete existing user
    await userModel.deleteOne({ email });
    console.log('Deleted existing admin user');

    // Create fresh hash
    const hashedPassword = await argon2.hash(password);
    console.log('Created password hash, length:', hashedPassword.length);

    // Create new user directly
    const newUser = new userModel({
      email,
      password: hashedPassword,
      name,
      role: 'admin',
      isActive: true,
      isDeleted: false,
    });
    await newUser.save();
    console.log('Saved new admin user to database');

    // Verify it works
    const savedUser = await userModel.findOne({ email });
    if (savedUser) {
      const isValid = await argon2.verify(savedUser.password, password);
      console.log(`Password verification: ${isValid ? 'PASSED ✓' : 'FAILED ✗'}`);
      
      if (isValid) {
        console.log('\n✅ Admin user ready!');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await app.close();
  }
}

bootstrap();
