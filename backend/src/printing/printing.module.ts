import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintJob } from './entities/print-job.entity';
import { PrintStation } from './entities/print-station.entity';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrintJob, PrintStation])],
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
