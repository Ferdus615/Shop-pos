import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { AckPrintJobDto } from './dto/ack-print-job.dto';
import { ClaimPrintJobsDto } from './dto/claim-print-jobs.dto';
import { CreatePrintJobDto } from './dto/create-print-job.dto';
import { QueryPrintJobsDto } from './dto/query-print-jobs.dto';
import { PrintingService } from './printing.service';

/**
 * Print queue shared by the tills and the counter-side bridge.
 *
 * Every route is shop-scoped through @CurrentShop, so a bridge signed in as
 * one shop can only ever claim that shop's slips.
 */
@ApiTags('printing')
@ApiBearerAuth()
@Controller('print-jobs')
export class PrintingController {
  constructor(private readonly printingService: PrintingService) {}

  // --- Till side ---------------------------------------------------------

  @Post()
  @ApiOperation({ summary: 'Queue a slip for the shop printer' })
  enqueue(@Body() dto: CreatePrintJobDto, @CurrentShop() shopId: string) {
    return this.printingService.enqueue(dto, shopId);
  }

  // Declared before ':id' routes so the literal path wins.
  @Get('printer-status')
  @ApiOperation({ summary: 'Is the shop printer reachable right now?' })
  getPrinterStatus(@CurrentShop() shopId: string) {
    return this.printingService.getPrinterStatus(shopId);
  }

  @Get()
  @ApiOperation({ summary: 'Recent print jobs, newest first' })
  findAll(@Query() query: QueryPrintJobsDto, @CurrentShop() shopId: string) {
    return this.printingService.findAll(query, shopId);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Requeue a failed slip' })
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentShop() shopId: string) {
    return this.printingService.retry(id, shopId);
  }

  // --- Bridge side -------------------------------------------------------

  @Post('claim')
  @ApiOperation({
    summary: 'Claim pending slips (bridge poll — also the station heartbeat)',
  })
  claim(@Body() dto: ClaimPrintJobsDto, @CurrentShop() shopId: string) {
    return this.printingService.claim(dto, shopId);
  }

  @Post(':id/ack')
  @ApiOperation({ summary: 'Report whether a claimed slip printed' })
  ack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AckPrintJobDto,
    @CurrentShop() shopId: string,
  ) {
    return this.printingService.ack(id, dto, shopId);
  }
}
