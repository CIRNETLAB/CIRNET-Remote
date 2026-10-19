<script setup lang="ts">
import { useExecutionCommands } from '../../composables/useExecutionCommands'
import WorkbenchIcon from './WorkbenchIcon.vue'
const commands=useExecutionCommands()
const unsupported='Pause and Step are not supported by the current execution contract. Use Stop to end an owned running or queued experiment.'
</script>
<template>
  <section class="run-ribbon" aria-label="Execution commands">
    <div class="run-command-buttons" role="toolbar" aria-label="Execution controls">
      <button :aria-label="commands.primaryLabel.value" :disabled="commands.primaryDisabled.value" :title="commands.primaryDisabled.value ? commands.blockedReason.value : commands.primaryLabel.value === 'Run' ? 'Run through the laboratory lifecycle' : commands.primaryLabel.value === 'Cancel' ? 'Cancel preparation before Create is sent' : 'Stop the owned running or queued experiment'" @click="commands.primaryAction"><WorkbenchIcon :name="commands.primaryLabel.value==='Run'?'play':'stop'" />{{ commands.primaryLabel.value }}</button>
      <button aria-label="Pause" disabled :title="unsupported" aria-describedby="execution-capability-help"><WorkbenchIcon name="pause" />Pause</button>
      <button aria-label="Step" disabled :title="unsupported" aria-describedby="execution-capability-help"><WorkbenchIcon name="step" />Step</button>
    </div>
    <p id="execution-capability-help" class="run-capability-help" tabindex="0">{{ unsupported }}</p>
  </section>
</template>
