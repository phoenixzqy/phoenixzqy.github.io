import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from release_notices import notices_text
from release_packages import digest


class ReleaseNoticesTest(unittest.TestCase):
    def fixture(self, root, commit='a' * 40, include_notices=True):
        package=root/'codex.zip'
        with zipfile.ZipFile(package,'w') as archive:
            archive.writestr('zai-release.json',json.dumps({'commit':commit,'version':'0.1.1'}))
            archive.writestr('LICENSE','Apache license fixture')
            if include_notices:
                archive.writestr('third-party-notices/DEPENDENCIES.txt','Original attribution <script> remains plain text')
        return {'appId':'zai-codex','release':{'version':'0.1.1','assets':[
            {'file':package.name,'bytes':package.stat().st_size,'sha256':digest(package)}]}}

    def test_notices_describe_final_release_and_preserve_original_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            data=self.fixture(root)
            text=notices_text(data,root,'a' * 40)
            self.assertIn('zai-codex 0.1.1',text)
            self.assertIn('Original attribution <script> remains plain text',text)
            self.assertIn('Apache license fixture',text)

    def test_other_source_and_missing_notice_material_are_rejected(self):
        for kwargs in ({'commit':'b' * 40},{'include_notices':False}):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                data=self.fixture(root,**kwargs)
                with self.assertRaises(ValueError):
                    notices_text(data,root,'a' * 40)
