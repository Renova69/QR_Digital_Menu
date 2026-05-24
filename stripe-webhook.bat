@echo off
echo Starting Stripe webhook listener...
echo Forwarding to http://localhost:3000/api/v1/payments/webhook
echo Press Ctrl+C to stop
echo.
"C:\Stripe\stripe.exe" listen --forward-to localhost:3000/api/v1/payments/webhook
pause
