import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Bed {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: false })
  isOccupied: boolean;
}
