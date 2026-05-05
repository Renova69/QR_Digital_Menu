import { Controller, Get, Redirect, HttpCode, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('API Information')
@Controller()
export class AppController {
  constructor() {}

  @Get()
  @Redirect('/api', 302)
  @ApiOperation({ summary: 'API Root Redirect' })
  getRoot() {
    // Redirect to API info page
  }

  @Get('api')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @ApiOperation({ summary: 'API Information' })
  @ApiResponse({
    status: 200,
    description: 'API information and available endpoints',
    schema: {
      example: {
        message: 'QR Menu API',
        version: '1.0.0',
        documentation: '/api-docs',
        endpoints: {
          authentication: '/api/auth',
          menu: '/api/menu',
          restaurants: '/api/restaurants',
          dashboard: '/api/dashboard',
        },
      },
    },
  })
  getApiInfo() {
    return {
      message: 'QR Menu API',
      version: '1.0.0',
      documentation: '/api-docs',
      endpoints: {
        authentication: '/api/auth',
        menu: '/api/menu',
        restaurants: '/api/restaurants',
        dashboard: '/api/dashboard/summary',
      },
    };
  }
}
