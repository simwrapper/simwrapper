# THIS PATCHES PYTABLES
# --> so that pytables works with Rclone-mounted remote storage (Azure,AWS,etc)
import sys
from pathlib import Path
import subprocess

def find_site_packages():
    """Find the site-packages directory"""
    for path in sys.path:
        if 'site-packages' in path and Path(path).exists():
            return Path(path)
    return None

def apply_patches():
    site_packages = find_site_packages()
    if not site_packages:
        print("Could not find site-packages directory")
        return

    print(site_packages)
    patch_file = Path("patches/pytables-3.10.2.patch")
    if not patch_file.exists():
        print(f"Patch file not found: {patch_file}")
        return

    dependency_dir = site_packages / "tables"

    if not dependency_dir.exists():
        print(f"Dependency directory not found: {dependency_dir}")
        return

    try:
        subprocess.run(
            ["pypatch", "apply", "patches/pytables-3.10.2.patch", "tables"],
            check=True
        )

        # # Read and apply patch using pypatch
        # with open(patch_file, 'r') as f:
        #     patch_content = f.read()

        # # Apply patch to the dependency directory
        # os.chdir(dependency_dir)
        # result = apply_patch_file(patch_content)

        print(f"Successfully applied patch: {patch_file}")

        # if result:
        #     print(f"Successfully applied patch: {patch_file}")
        # else:
        #     print(f"Failed to apply patch: {patch_file}")

    except Exception as e:
        print(f"Error applying patch: {e}")

if __name__ == "__main__":
    apply_patches()
