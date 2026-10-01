import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class NotificationResponseDto {
  @Expose()
  id: string;

  @Expose()
  type: 'work_order_ready' | 'purchase_order_received';

  @Expose()
  title: string;

  @Expose()
  body: string;

  @Expose()
  link: string;

  @Expose()
  readAt: string | null;

  @Expose()
  createdAt: string;
}
