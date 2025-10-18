import numpy as np
import tables  # requires pytables >= 3.1

class ShapeError(Exception):
    pass

class SimpleH5File(tables.File):
    """
    OMX File class, which contains all the methods for adding, removing, manipulating tables
    and mappings in an OMX file.
    """

    def __init__(self, f,m,t,r,f1, **kwargs):
        tables.File.__init__(self,f,m,t,r,f1,**kwargs)
        self._shape = None

    def version(self):
        """
        Return the OMX file format of this OMX file, embedded in the OMX_VERSION file attribute.
        Returns None if the OMX_VERSION attribute is not set.
        """
        if 'OMX_VERSION' in self.root._v_attrs:
            return self.root._v_attrs['OMX_VERSION']
        else:
            return None

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

        # If shape is already set in root node attributes, grab it
        if 'SHAPE' in self.root._v_attrs:
            # Shape is stored as a numpy.array:
            arrayshape = self.root._v_attrs['SHAPE']
            # which must be converted to a tuple:
            realshape = (arrayshape[0],arrayshape[1])
            self._shape = realshape
            return self._shape

        # Inspect the first CArray object to determine its shape
        if len(self) > 0:
            # jwd: generator has no next funtion in python 3
            # next() function supported in both in python 2.6+ and python 3
            self._shape = next(self.iter_nodes(self.root,'CArray')).shape

            # Store it if we can
            if self._iswritable():
                storeshape = np.array(
                    [self._shape[0],self._shape[1]],
                    dtype='int32')
                self.root._v_attrs['SHAPE'] = storeshape

            return self._shape

        else:
            return None


    def list_matrices(self):
        """
        List the matrix names in this File

        Returns
        -------
        matrices : list
            List of all matrix names stored in this OMX file.
        """
        allnodes = self.list_nodes(self.root, 'CArray')

        return [node.attrs.name.decode('utf-8') for node in self.list_nodes(self.root,'CArray')]


    def list_all_attributes(self):
        """
        Return set of all attributes used for any Matrix in this File

        Returns
        -------
        all_attributes : set
            The combined set of all attribute names that exist on any matrix in this file.
        """
        all_tags = set()
        for m in self.iter_nodes(self.root, 'CArray'):
            all_tags.update(m.attrs._v_attrnamesuser)
        return sorted(all_tags)


    # MAPPINGS -----------------------------------------------
    def list_mappings(self):
        """
        List all mappings in this file

        Returns:
        --------
        mappings : list
            List of the names of all mappings in the OMX file. Mappings
            are stored internally in the 'lookup' subset of the HDF5 file
            structure. Returns empty list if there are no mappings.
        """
        try:
            return [m.name for m in self.list_nodes(self.root.lookup)]
        except:
            return []


    def delete_mapping(self, title):
        """
        Remove a mapping.

        Raises:
        -------
        LookupError : if the specified mapping does not exist.
        """

        try:
            self.remove_node(self.root.lookup, title)
        except:
            raise LookupError('No such mapping: '+title)


    def mapping(self, title):
        """
        Return dict containing key:value pairs for specified mapping. Keys
        represent the map item and value represents the array offset.

        Parameters:
        -----------
        title : string
            Name of the mapping to be returned

        Returns:
        --------
        mapping : dict
            Dictionary where each key is the map item, and the value
            represents the array offset.

        Raises:
        -------
        LookupError : if the specified mapping does not exist.
        """

        try:
            # fetch entries
            entries = []
            entries.extend(self.get_node(self.root.lookup, title)[:])

            # build reverse key-lookup
            keymap = {}
            for i in range(len(entries)):
                keymap[entries[i]] = i

            return keymap

        except:
            raise LookupError('No such mapping: '+title)

    def map_entries(self, title):
        """Return a list of entries for the specified mapping.
           Throws LookupError if the specified mapping does not exist.
        """
        try:
            # fetch entries
            entries = []
            entries.extend(self.get_node(self.root.lookup, title)[:])

            return entries

        except:
            raise LookupError('No such mapping: '+title)


    # The following functions implement Python list/dictionary lookups. ----
    def __getitem__(self,key):
        """Return a matrix by name, or a list of matrices by attributes"""

        if isinstance(key, str):
            if (key in self.root):
                node = self.get_node(self.root, key)
                return node
            matrices = self.list_nodes(self.root,'CArray')
            for m in matrices:
                if m.attrs.name.decode('utf-8') == key:
                    return m
            raise LookupError('Name not unique')

        if 'keys' not in dir(key):
            raise LookupError('Key %s not found' % key)

        # Loop through key/value pairs
        mats = self.list_nodes(self.root, 'CArray')
        for a in key.keys():
            mats = self._getMatricesByAttribute(a, key[a], mats)

        return mats

    def _getMatricesByAttribute(self, key, value, matrices=None):

        answer = []

        if matrices is None:
            matrices = self.list_nodes(self.root,'CArray')

        for m in matrices:
            if m.attrs is None:
                continue

            # Only test if key is present in matrix attributes
            if key in m.attrs._v_attrnames and m.attrs[key] == value:
                answer.append(m)

        return answer


    def __len__(self):
        return len(self.list_nodes(self.root, 'CArray'))


    def __setitem__(self, key, dataset):
        raise Exception("Cannot create fake OMX matrices")


    def __delitem__(self, key):
        self.remove_node(self.root, key)


    def __iter__(self):
        """Iterate over the keys in this container"""
        return self.iter_nodes(self.root, 'CArray')


    def __contains__(self, item):
        return item in self.root._v_children

    @staticmethod
    def open_file(filename, mode='r', title='', root_uep='/',
                 filters=tables.Filters(complevel=1, shuffle=True, fletcher32=False, complib='zlib'),
                 shape=None, **kwargs):
        """
        Open or create a new OMX file. New files will be created with default
        zlib compression enabled.

        Parameters
        ----------
        filename : string
            Name or path and name of file
        mode : string
            'r' for read-only;
            'w' to write (erases existing file);
            'a' to read/write an existing file (will create it if doesn't exist).
            Ignored in read-only mode.
        title : string
            Short description of this file, used when creating the file. Default is ''.
            Ignored in read-only mode.
        filters : tables.Filters
            HDF5 default filter options for compression, shuffling, etc. Default for
            OMX standard file format is: zlib compression level 1, and shuffle=True.
            Only specify this if you want something other than the recommended standard
            HDF5 zip compression.
            'None' will create enormous uncompressed files.
            Only 'zlib' compression is guaranteed to be available on all HDF5 implementations.
            See HDF5 docs for more detail.
        shape: array-like
            Shape of matrices in this file. Default is None. Specify a valid shape
            (e.g. (1000,1200)) to enforce shape-checking for all added objects.
            If shape is not specified, the first added matrix will not be shape-checked
            and all subsequently added matrices must match the shape of the first matrix.
            All tables in an OMX file must have the same shape.

        Returns
        -------
        f : openmatrix.File
            The file object for reading and writing.
        """
        if mode != 'r':
            raise Exception("Cannot write non-standard OMX files")

        f = SimpleH5File(filename, mode, title, root_uep, filters, **kwargs)

        return f

    # BACKWARD COMPATIBILITY:
    # PyTables switched from camelCaseMethods to camel_case_methods
    # We follow suit, and keep old methods for backward compat:
    deleteMapping = delete_mapping
    listMatrices = list_matrices
    listAllAttributes = list_all_attributes
    listMappings = list_mappings
    mapentries = map_entries
    mapEntries = map_entries

