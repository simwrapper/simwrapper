import h5py

class ShapeError(Exception):
    pass


class _Matrix:
    """Lightweight adapter around an h5py.Dataset that mimics the small slice of
    the PyTables CArray API this project relies on (notably `.read()`), so a
    fake-OMX matrix and an openmatrix/PyTables matrix can be used interchangeably.
    """

    def __init__(self, dataset):
        self._ds = dataset

    def read(self):
        # Read the whole dataset into a numpy array (PyTables CArray.read()).
        return self._ds[()]

    @property
    def shape(self):
        return self._ds.shape

    @property
    def attrs(self):
        return self._ds.attrs

    @property
    def name(self):
        # Fake-OMX files may carry a display name in a 'name' attribute; fall
        # back to the HDF5 dataset key when it is absent.
        raw = self._ds.attrs.get('name')
        if raw is None:
            return self._ds.name.split('/')[-1]
        if isinstance(raw, bytes):
            return raw.decode('utf-8')
        return raw


class SimpleH5File:
    """
    Read-only reader for "fake OMX" files: plain HDF5 files whose matrices are
    stored as datasets directly under the root group, with optional mappings
    under a '/lookup' group. Used for files that are not real OMX (i.e. they do
    not carry an OMX_VERSION root attribute).

    This preserves the public API the project used when the class subclassed
    tables.File, but is backed by h5py instead of PyTables.
    """

    def __init__(self, filename, mode='r'):
        if mode != 'r':
            raise Exception("Cannot write non-standard OMX files")
        self._h5 = h5py.File(filename, mode)
        self._shape = None

    def close(self):
        self._h5.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ---- internal helpers -------------------------------------------------
    def _matrix_datasets(self):
        """The h5py.Datasets sitting directly under root (the 'matrices').

        Groups such as '/lookup' (and '/data' on real OMX files) are skipped
        because they are Groups, not Datasets.
        """
        return [self._h5[key] for key in self._h5.keys()
                if isinstance(self._h5[key], h5py.Dataset)]

    # ----------------------------------------------------------------------
    def version(self):
        """
        Return the OMX file format version, from the OMX_VERSION root attribute,
        or None if it is not set.
        """
        return self._h5.attrs.get('OMX_VERSION')

    def shape(self):
        """
        Get the one and only shape of all matrices in this File

        Returns
        -------
        shape : tuple
            Tuple of (rows,columns) for this matrix and file.
        """

        # If we already have the shape, just return it
        if self._shape:
            return self._shape

        # If shape is already set in root attributes, grab it
        if 'SHAPE' in self._h5.attrs:
            # Shape is stored as an array of [rows, columns]
            arrayshape = self._h5.attrs['SHAPE']
            self._shape = (arrayshape[0], arrayshape[1])
            return self._shape

        # Otherwise inspect the first matrix to determine its shape
        datasets = self._matrix_datasets()
        if len(datasets) > 0:
            self._shape = datasets[0].shape
            return self._shape

        return None


    def list_matrices(self):
        """
        List the matrix names in this File

        Returns
        -------
        matrices : list
            List of all matrix names stored in this file.
        """
        return [_Matrix(d).name for d in self._matrix_datasets()]


    def list_all_attributes(self):
        """
        Return sorted list of all attribute names used on any matrix in this File
        """
        all_tags = set()
        for d in self._matrix_datasets():
            all_tags.update(d.attrs.keys())
        return sorted(all_tags)


    # MAPPINGS -----------------------------------------------
    def list_mappings(self):
        """
        List all mappings in this file. Mappings live in the '/lookup' group.
        Returns an empty list if there are no mappings.
        """
        try:
            return list(self._h5['lookup'].keys())
        except Exception:
            return []


    def delete_mapping(self, title):
        """
        Remove a mapping.

        Raises:
        -------
        LookupError : if the specified mapping does not exist.
        """
        try:
            del self._h5['lookup'][title]
        except Exception:
            raise LookupError('No such mapping: ' + title)


    def mapping(self, title):
        """
        Return dict of key:value pairs for the specified mapping, where each key
        is the map item and the value is its array offset.

        Raises:
        -------
        LookupError : if the specified mapping does not exist.
        """
        try:
            entries = list(self._h5['lookup'][title][:])

            keymap = {}
            for i in range(len(entries)):
                keymap[entries[i]] = i

            return keymap

        except Exception:
            raise LookupError('No such mapping: ' + title)

    def map_entries(self, title):
        """Return a list of entries for the specified mapping.
           Throws LookupError if the specified mapping does not exist.
        """
        try:
            return list(self._h5['lookup'][title][:])

        except Exception:
            raise LookupError('No such mapping: ' + title)


    # The following functions implement Python list/dictionary lookups. ----
    def __getitem__(self, key):
        """Return a matrix by name, or a list of matrices by attributes"""

        if isinstance(key, str):
            if key in self._h5 and isinstance(self._h5[key], h5py.Dataset):
                return _Matrix(self._h5[key])
            for d in self._matrix_datasets():
                m = _Matrix(d)
                if m.name == key:
                    return m
            raise LookupError('Name not unique')

        if 'keys' not in dir(key):
            raise LookupError('Key %s not found' % key)

        # Loop through key/value pairs
        mats = [_Matrix(d) for d in self._matrix_datasets()]
        for a in key.keys():
            mats = self._getMatricesByAttribute(a, key[a], mats)

        return mats

    def _getMatricesByAttribute(self, key, value, matrices=None):

        answer = []

        if matrices is None:
            matrices = [_Matrix(d) for d in self._matrix_datasets()]

        for m in matrices:
            if m.attrs is None:
                continue

            # Only test if key is present in matrix attributes
            if key in m.attrs and m.attrs[key] == value:
                answer.append(m)

        return answer


    def __len__(self):
        return len(self._matrix_datasets())


    def __setitem__(self, key, dataset):
        raise Exception("Cannot create fake OMX matrices")


    def __delitem__(self, key):
        del self._h5[key]


    def __iter__(self):
        """Iterate over the matrices in this container"""
        return iter(_Matrix(d) for d in self._matrix_datasets())


    def __contains__(self, item):
        return item in self._h5

    @staticmethod
    def open_file(filename, mode='r', **kwargs):
        """
        Open a fake-OMX (plain HDF5) file for reading.

        Parameters
        ----------
        filename : string
            Name or path and name of file
        mode : string
            Only 'r' (read-only) is supported.

        Returns
        -------
        f : SimpleH5File
            The file object for reading.
        """
        if mode != 'r':
            raise Exception("Cannot write non-standard OMX files")

        return SimpleH5File(filename, mode)

    # BACKWARD COMPATIBILITY:
    # PyTables switched from camelCaseMethods to camel_case_methods
    # We follow suit, and keep old methods for backward compat:
    deleteMapping = delete_mapping
    listMatrices = list_matrices
    listAllAttributes = list_all_attributes
    listMappings = list_mappings
    mapentries = map_entries
    mapEntries = map_entries
