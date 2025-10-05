<template>
  <v-card class="debug-console" :class="{ 'minimized': isMinimized }">
    <v-card-title class="py-2 d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon class="mr-2">mdi-bug</v-icon>
        VISTA3D Debug Console
      </div>
      <v-btn 
        size="x-small" 
        icon
        @click="toggleMinimize"
      >
        <v-icon>{{ isMinimized ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
    </v-card-title>
    
    <v-card-text v-show="!isMinimized" class="pa-2">
      <div class="debug-log" ref="logContainer">
        <div
          v-for="(log, index) in logs"
          :key="index"
          :class="['log-entry', `log-${log.level}`]"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
      
      <div class="d-flex gap-2 mt-2">
        <v-btn size="small" @click="clearLogs" variant="outlined">
          <v-icon class="mr-1">mdi-delete</v-icon>
          Clear
        </v-btn>
        <v-btn size="small" @click="exportLogs" variant="outlined">
          <v-icon class="mr-1">mdi-download</v-icon>
          Export
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';

interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

const logs = ref<LogEntry[]>([]);
const isMinimized = ref(false);
const logContainer = ref<HTMLElement>();

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function addLog(level: LogEntry['level'], message: string) {
  const time = new Date().toLocaleTimeString();
  logs.value.push({ time, level, message });
  
  // Auto-scroll to bottom
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
  
  // Keep only last 100 logs
  if (logs.value.length > 100) {
    logs.value.shift();
  }
}

function clearLogs() {
  logs.value = [];
}

function exportLogs() {
  const logText = logs.value
    .map(log => `[${log.time}] ${log.level.toUpperCase()}: ${log.message}`)
    .join('\n');
  
  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vista3d-debug-${new Date().toISOString().slice(0, 19)}.log`;
  a.click();
  URL.revokeObjectURL(url);
}

function toggleMinimize() {
  isMinimized.value = !isMinimized.value;
}

// Intercept console calls for VISTA3D related logs
function interceptConsole() {
  console.log = (...args) => {
    originalConsole.log(...args);
    const message = args.join(' ');
    if (message.includes('VISTA3D') || message.includes('🧠') || message.includes('📋') || message.includes('⚙️')) {
      addLog('info', message);
    }
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    const message = args.join(' ');
    if (message.includes('VISTA3D') || message.includes('⚠️')) {
      addLog('warn', message);
    }
  };

  console.error = (...args) => {
    originalConsole.error(...args);
    const message = args.join(' ');
    if (message.includes('VISTA3D') || message.includes('❌')) {
      addLog('error', message);
    }
  };
}

onMounted(() => {
  interceptConsole();
  addLog('info', '🚀 VISTA3D Debug Console initialized');
});

onUnmounted(() => {
  // Restore original console methods
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});
</script>

<style scoped>
.debug-console {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 400px;
  max-height: 300px;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.9);
  color: white;
}

.debug-console.minimized {
  max-height: 60px;
}

.debug-log {
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.4;
}

.log-entry {
  display: flex;
  margin-bottom: 2px;
  padding: 2px 4px;
  border-radius: 2px;
}

.log-time {
  color: #888;
  margin-right: 8px;
  min-width: 80px;
}

.log-message {
  flex: 1;
}

.log-info { background: rgba(33, 150, 243, 0.1); }
.log-warn { background: rgba(255, 152, 0, 0.1); color: #ff9800; }
.log-error { background: rgba(244, 67, 54, 0.1); color: #f44336; }
.log-success { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
</style>