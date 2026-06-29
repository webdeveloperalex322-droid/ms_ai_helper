import { Global, Module } from '@nestjs/common';
import { LLM_CLIENT_TOKEN } from './llm-client.interface';
import { AitunnelOpenAIClientService } from './aitunnel-openai-client.service';

@Global()
@Module({
  providers: [
    AitunnelOpenAIClientService,
    {
      provide: LLM_CLIENT_TOKEN,
      useExisting: AitunnelOpenAIClientService,
    },
  ],
  exports: [LLM_CLIENT_TOKEN, AitunnelOpenAIClientService],
})
export class LlmModule {}
