#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
echo "🧪 Testing VISTA3D Server..."
python -c "
import sys
sys.path.append('.')
import asyncio
from vista3d_server import analyzer

print('Model available:', analyzer.workflow is not None)
print('Device:', analyzer.device)
print('Label count:', len(analyzer.label_names))
print('✅ Server components loaded successfully')
"
