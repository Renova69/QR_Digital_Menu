import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFeedbackInvitationDto {
  /**
   * Optional. The client cannot always name the payment that just completed —
   * a hosted-checkout round-trip (Stripe/BORICA/ePay) leaves the app entirely
   * and can come back without its sessionStorage marker, and waiter-settled
   * payments are never initiated by the customer's device at all.
   *
   * When omitted the server resolves the session's most recent SUCCEEDED
   * payment, which is the authoritative answer regardless. The table-session
   * token in the request header is what actually authorizes the lookup, so
   * omitting this widens nothing.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  paymentId?: string;
}
