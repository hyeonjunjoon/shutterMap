import { IsLatitude, IsLongitude } from 'class-validator';

export class SetLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
