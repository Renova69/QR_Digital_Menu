import { Body, Controller, Post, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { VerifyDeviceEnrollmentDto } from './dto/verify-device-enrollment.dto';

@Controller('device-enrollment')
export class DeviceEnrollmentController {
  constructor(private readonly deviceEnrollment: DeviceEnrollmentService) {}

  @Post('verify')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  verify(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: VerifyDeviceEnrollmentDto,
  ) {
    return this.deviceEnrollment.verifyEnrollment(dto.token);
  }
}
