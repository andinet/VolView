#!/usr/bin/env python3
"""
Test script to verify VISTA3D server dependencies work correctly
This validates that all required packages including pynrrd are functional
"""

import sys
import traceback

def test_imports():
    """Test all critical imports"""
    print("🧪 Testing critical imports...")
    
    try:
        import monai
        print(f"✅ MONAI {monai.__version__} - OK")
    except ImportError as e:
        print(f"❌ MONAI import failed: {e}")
        return False
    
    try:
        import torch
        print(f"✅ PyTorch {torch.__version__} - OK")
    except ImportError as e:
        print(f"❌ PyTorch import failed: {e}")
        return False
    
    try:
        import fastapi
        print(f"✅ FastAPI {fastapi.__version__} - OK")
    except ImportError as e:
        print(f"❌ FastAPI import failed: {e}")
        return False
    
    try:
        import nrrd
        print(f"✅ pynrrd - OK")
    except ImportError as e:
        print(f"❌ pynrrd import failed: {e}")
        return False
    
    try:
        import numpy as np
        print(f"✅ NumPy {np.__version__} - OK")
    except ImportError as e:
        print(f"❌ NumPy import failed: {e}")
        return False
    
    return True

def test_nrrd_functionality():
    """Test NRRD read/write functionality"""
    print("\n🔬 Testing NRRD functionality...")
    
    try:
        import nrrd
        import numpy as np
        import tempfile
        import os
        
        # Create test data
        test_data = np.random.rand(10, 10, 10).astype(np.float32)
        
        # Test write/read cycle
        with tempfile.NamedTemporaryFile(suffix='.nrrd', delete=False) as tmp:
            nrrd.write(tmp.name, test_data)
            read_data, header = nrrd.read(tmp.name)
            
            # Cleanup
            os.unlink(tmp.name)
            
            # Verify data integrity
            if np.allclose(test_data, read_data):
                print("✅ NRRD read/write - OK")
                return True
            else:
                print("❌ NRRD data integrity failed")
                return False
                
    except Exception as e:
        print(f"❌ NRRD functionality test failed: {e}")
        return False

def test_monai_vista():
    """Test MONAI VISTA3D model import"""
    print("\n🏥 Testing MONAI VISTA3D import...")
    
    try:
        from monai.networks.nets import VISTA3D
        print("✅ MONAI VISTA3D import - OK")
        return True
        
    except Exception as e:
        print(f"❌ MONAI VISTA3D import failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🔍 VISTA3D Dependency Verification Test\n")
    
    all_passed = True
    
    # Test imports
    if not test_imports():
        all_passed = False
    
    # Test NRRD functionality
    if not test_nrrd_functionality():
        all_passed = False
    
    # Test MONAI VISTA
    if not test_monai_vista():
        all_passed = False
    
    print("\n" + "="*50)
    if all_passed:
        print("🎉 All tests passed! Dependencies are correctly installed.")
    else:
        print("❌ Some tests failed. Check the output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()