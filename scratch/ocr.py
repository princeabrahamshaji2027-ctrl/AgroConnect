import ctypes
import ctypes.util
import os
import sys

# Load ObjC runtime and frameworks
objc = ctypes.cdll.LoadLibrary(ctypes.util.find_library('objc'))
cf = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreFoundation'))
foundation = ctypes.cdll.LoadLibrary(ctypes.util.find_library('Foundation'))
# Load Vision and AppKit/CoreGraphics
vision_path = '/System/Library/Frameworks/Vision.framework/Vision'
vision = ctypes.cdll.LoadLibrary(vision_path)
appkit = ctypes.cdll.LoadLibrary(ctypes.util.find_library('AppKit'))

# Define ObjC types and helpers
objc.sel_registerName.restype = ctypes.c_void_p
objc.sel_registerName.argtypes = [ctypes.c_char_p]
objc.objc_getClass.restype = ctypes.c_void_p
objc.objc_getClass.argtypes = [ctypes.c_char_p]

# Send message helper
def msg(obj, selector, *args, restype=ctypes.c_void_p, argtypes=None):
    sel = objc.sel_registerName(selector.encode('utf-8'))
    func = objc.objc_msgSend
    func.restype = restype
    if argtypes is None:
        func.argtypes = [ctypes.c_void_p, ctypes.c_void_p] + [ctypes.c_void_p] * len(args)
    else:
        func.argtypes = [ctypes.c_void_p, ctypes.c_void_p] + list(argtypes)
    return func(obj, sel, *args)

# Create NSString
def nsstr(s):
    cls = objc.objc_getClass(b'NSString')
    return msg(cls, 'stringWithUTF8String:', ctypes.c_char_p(s.encode('utf-8')))

# Create NSURL from path
def nsurl(path):
    cls = objc.objc_getClass(b'NSURL')
    return msg(cls, 'fileURLWithPath:', nsstr(os.path.abspath(path)))

# Convert NSString to Python string
def py_str(ns_str_obj):
    if not ns_str_obj:
        return ""
    c_str = msg(ns_str_obj, 'UTF8String', restype=ctypes.c_char_p)
    return c_str.decode('utf-8') if c_str else ""

# Main OCR function
def ocr_image(image_path):
    # Load image via CIImage
    ciimage_cls = objc.objc_getClass(b'CIImage')
    ciimg = msg(ciimage_cls, 'imageWithContentsOfURL:', nsurl(image_path))
    if not ciimg:
        print(f"Failed to load CIImage: {image_path}")
        return
        
    # Create VNImageRequestHandler
    req_handler_cls = objc.objc_getClass(b'VNImageRequestHandler')
    handler = msg(req_handler_cls, 'alloc')
    handler = msg(handler, 'initWithCIImage:options:', ciimg, None)
    
    # Create VNRecognizeTextRequest
    req_cls = objc.objc_getClass(b'VNRecognizeTextRequest')
    request = msg(req_cls, 'alloc')
    request = msg(request, 'init')
    
    # Set recognitionLevel to accurate (0)
    msg(request, 'setRecognitionLevel:', ctypes.c_int(0), argtypes=[ctypes.c_int])
    
    # Perform request
    nsarray_cls = objc.objc_getClass(b'NSArray')
    req_array = msg(nsarray_cls, 'arrayWithObject:', request)
    
    error = ctypes.c_void_p(0)
    success = msg(handler, 'performRequests:error:', req_array, ctypes.byref(error), restype=ctypes.c_bool)
    
    if not success:
        print("Failed to perform requests")
        return
        
    # Get results
    results = msg(request, 'results')
    count = msg(results, 'count', restype=ctypes.c_ulong)
    
    for i in range(count):
        observation = msg(results, 'objectAtIndex:', ctypes.c_ulong(i), argtypes=[ctypes.c_ulong])
        candidates = msg(observation, 'topCandidates:', ctypes.c_ulong(1), argtypes=[ctypes.c_ulong])
        if msg(candidates, 'count', restype=ctypes.c_ulong) > 0:
            candidate = msg(candidates, 'objectAtIndex:', ctypes.c_ulong(0), argtypes=[ctypes.c_ulong])
            text_str = msg(candidate, 'string')
            print(py_str(text_str))

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 ocr.py <path-to-image>")
        sys.exit(1)
    ocr_image(sys.argv[1])
