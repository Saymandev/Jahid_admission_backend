# Backend - Accounting Management System

NestJS backend for the Residential & Coaching Accounting Management System.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (see `.env.example`)

3. Start MongoDB (local or cloud)

4. Create admin user:
```bash
npm run seed:admin
```

Or set environment variables:
```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123 npm run seed:admin
```

5. Start development server:
```bash
npm run start:dev
```

## API Documentation

### Authentication Endpoints

- `POST /api/auth/login` - Login
  ```json
  {
    "email": "admin@example.com",
    "password": "password"
  }
  ```

- `POST /api/auth/refresh` - Refresh token
  ```json
  {
    "refreshToken": "token"
  }
  ```

- `GET /api/auth/me` - Get current user (requires auth)

### Residential Endpoints

- `GET /api/residential/rooms` - List rooms
- `POST /api/residential/rooms` - Create room (Admin only)
- `GET /api/residential/students` - List students
- `POST /api/residential/students` - Create student (Admin only)
- `GET /api/residential/students/:id` - Get student details
- `GET /api/residential/students/:id/due-status` - Get due status with calendar data
- `POST /api/residential/students/:id/checkout` - Checkout student (Admin only)
- `POST /api/residential/payments` - Record payment
- `GET /api/residential/dashboard/stats` - Dashboard statistics

### Coaching Endpoints

- `GET /api/coaching/admissions` - List admissions
- `POST /api/coaching/admissions` - Create admission (Admin only)
- `POST /api/coaching/admissions/payments` - Record payment
- `GET /api/coaching/stats` - Coaching statistics

## Security

- JWT authentication required for all endpoints except login/refresh
- Role-based access control (Admin/Staff)
- Rate limiting: 100 requests per minute
- Input validation on all DTOs
- Soft delete for data preservation
- Audit logs for critical actions

## Cron Jobs

- Monthly billing: 1st of every month at 00:00
- Due status check: Daily at midnight

## Socket.IO Events

- `payment-update` - Emitted when payment is recorded
- `dashboard-update` - Emitted when dashboard stats change
- `due-status-update` - Emitted when student due status changes
