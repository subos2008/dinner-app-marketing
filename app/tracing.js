'use strict';

const apiKey = process.env.HONEYCOMB_API_KEY;
if (!apiKey) {
  console.warn('[tracing] HONEYCOMB_API_KEY not set — tracing disabled');
  return;
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!endpoint) {
  console.warn('[tracing] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const exporter = new OTLPTraceExporter({
  url: `${endpoint}/v1/traces`,
  headers: {
    'x-honeycomb-team': apiKey
  }
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false }
    })
  ]
});

sdk.start();
console.log('[tracing] OpenTelemetry initialised — exporting to Honeycomb');

function shutdown() {
  sdk.shutdown()
    .then(() => console.log('[tracing] Flushed spans'))
    .catch(err => console.error('[tracing] Shutdown error:', err))
    .finally(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
