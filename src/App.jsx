import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  X, 
  Save, 
  BookOpen,
  Mic2,
  ListMusic,
  ListPlus,
  ArrowLeft,
  CheckCircle2,
  PlaySquare
} from 'lucide-react';

// Inline UI Components to ensure the preview works without external UI libraries
const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);
const CardHeader = ({ children, className = '' }) => (
  <div className={`p-6 pb-3 ${className}`}>{children}</div>
);
const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-xl font-bold text-slate-800 ${className}`}>{children}</h3>
);
const CardContent = ({ children, className = '' }) => (
  <div className={`px-6 pb-4 flex-grow ${className}`}>{children}</div>
);
const CardFooter = ({ children, className = '' }) => (
  <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center ${className}`}>{children}</div>
);

const GENRES = [
  'Pop', 'Rock', 'Folk', 'Acoustic Rock', 'Folk Pop', 
  'Blues', 'Jazz', 'Classical', 'Country', 'R&B', 'Other'
];

const initialSongs = [
  { id: 1, name: 'Wonderwall', genre: 'Acoustic Rock', text: 'Today is gonna be the day\nThat they\'re gonna throw it back to you\nBy now you should\'ve somehow\nRealized what you gotta do', lastPracticed: '2023-10-10' },
  { id: 2, name: 'Fast Car', genre: 'Folk Pop', text: 'You got a fast car\nI want a ticket to anywhere\nMaybe we make a deal\nMaybe together we can get somewhere', lastPracticed: '2023-10-12' },
  { id: 3, name: 'Hallelujah', genre: 'Folk', text: 'I\'ve heard there was a secret chord\nThat David played, and it pleased the Lord\nBut you don\'t really care for music, do you?', lastPracticed: '2023-10-05' },
];

const initialPlaylists = [
  { id: 101, name: 'Coffee Shop Gig', songIds: [1, 2] },
  { id: 102, name: 'Practice List', songIds: [3] }
];

export default function RepertoireApp() {
  // App State
  const [songs, setSongs] = useState(() => {
    try {
      const saved = localStorage.getItem('repertoire-songs');
      return saved ? JSON.parse(saved) : initialSongs;
    } catch { return initialSongs; }
  });
  
  const [playlists, setPlaylists] = useState(() => {
    try {
      const saved = localStorage.getItem('repertoire-playlists');
      return saved ? JSON.parse(saved) : initialPlaylists;
    } catch { return initialPlaylists; }
  });

  const [view, setView] = useState('songs'); // 'songs' or 'playlists'
  
  // Song List State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  
  // Song Form State
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [editingSongId, setEditingSongId] = useState(null);
  const [formData, setFormData] = useState({ name: '', genre: 'Pop', text: '' });
  
  // Playlist State
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [playlistModal, setPlaylistModal] = useState({ isOpen: false, songId: null });
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('repertoire-songs', JSON.stringify(songs));
  }, [songs]);

  useEffect(() => {
    localStorage.setItem('repertoire-playlists', JSON.stringify(playlists));
  }, [playlists]);

  // Song Handlers
  const handleAddNew = () => {
    setIsAddingMode(true);
    setEditingSongId(null);
    setFormData({ name: '', genre: 'Pop', text: '' });
  };

  const handleEdit = (song) => {
    setIsAddingMode(true);
    setEditingSongId(song.id);
    setFormData({ name: song.name, genre: song.genre, text: song.text });
  };

  const handleDelete = (id) => {
    setSongs(songs.filter(s => s.id !== id));
    // Remove deleted song from all playlists
    setPlaylists(playlists.map(p => ({
      ...p,
      songIds: p.songIds.filter(songId => songId !== id)
    })));
  };

  const handleSaveSong = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingSongId) {
      setSongs(songs.map(s => s.id === editingSongId ? { ...s, ...formData } : s));
    } else {
      const newSong = {
        ...formData,
        id: Date.now(),
        lastPracticed: new Date().toISOString().split('T')[0]
      };
      setSongs([newSong, ...songs]);
    }
    setIsAddingMode(false);
    setFormData({ name: '', genre: 'Pop', text: '' });
  };

  // Playlist Handlers
  const handleCreatePlaylist = (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newPlaylist = {
      id: Date.now(),
      name: newPlaylistName,
      songIds: []
    };
    setPlaylists([newPlaylist, ...playlists]);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
  };

  const handleDeletePlaylist = (id) => {
    setPlaylists(playlists.filter(p => p.id !== id));
    if (activePlaylistId === id) setActivePlaylistId(null);
  };

  const toggleSongInPlaylist = (playlistId, songId) => {
    setPlaylists(playlists.map(p => {
      if (p.id === playlistId) {
        const hasSong = p.songIds.includes(songId);
        return {
          ...p,
          songIds: hasSong ? p.songIds.filter(id => id !== songId) : [...p.songIds, songId]
        };
      }
      return p;
    }));
  };

  // Filtered Data
  const filteredSongs = songs.filter(song => {
    const matchesSearch = song.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (song.text && song.text.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesGenre = selectedGenre === 'All' || song.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md">
              <Mic2 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-tight">Repertoire</h1>
              <p className="text-xs text-slate-500 font-medium">{songs.length} tracks ready to play</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto border border-slate-200">
              <button
                onClick={() => { setView('songs'); setActivePlaylistId(null); }}
                className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'songs' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Library
              </button>
              <button
                onClick={() => setView('playlists')}
                className={`flex-1 sm:px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${view === 'playlists' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ListMusic size={16} />
                Playlists
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative">
        
        {        playlistModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-800">Add to Playlist</h3>
                <button onClick={() => setPlaylistModal({ isOpen: false, songId: null })} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-2 overflow-y-auto flex-grow">
                {playlists.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center p-6">No playlists yet. Create one below!</p>
                ) : (
                  playlists.map(playlist => {
                    const isInPlaylist = playlist.songIds.includes(playlistModal.songId);
                    return (
                      <button
                        key={playlist.id}
                        onClick={() => toggleSongInPlaylist(playlist.id, playlistModal.songId)}
                        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
                      >
                        <span className="font-medium text-slate-700">{playlist.name}</span>
                        {isInPlaylist ? (
                          <CheckCircle2 size={20} className="text-indigo-600" />
                        ) : (
                          <Plus size={20} className="text-slate-300" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-white">
                <button 
                  onClick={() => {
                    setPlaylistModal({ isOpen: false, songId: null });
                    setView('playlists');
                    setIsCreatingPlaylist(true);
                  }}
                  className="w-full py-2.5 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                >
                  Create New Playlist
                </button>
              </div>
            </div>
          </div>
        )}

        {}
        {view === 'playlists' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {!activePlaylistId ? (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">Your Playlists</h2>
                  <button 
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    <Plus size={18} /> New Playlist
                  </button>
                </div>

                {isCreatingPlaylist && (
                  <Card className="mb-6 border-indigo-200 bg-indigo-50/50">
                    <form onSubmit={handleCreatePlaylist} className="p-4 flex flex-col sm:flex-row gap-3 items-center">
                      <input 
                        autoFocus
                        type="text" 
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="My Awesome Gig..."
                        className="flex-1 w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      />
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button type="button" onClick={() => setIsCreatingPlaylist(false)} className="flex-1 sm:flex-none px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-medium transition-colors">Cancel</button>
                        <button type="submit" className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm">Save</button>
                      </div>
                    </form>
                  </Card>
                )}

                {playlists.length === 0 && !isCreatingPlaylist ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
                    <PlaySquare size={48} className="mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No playlists created</h3>
                    <p className="text-slate-500 mb-6">Group your songs for gigs, practice, or themes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {playlists.map(playlist => (
                      <Card key={playlist.id} className="cursor-pointer hover:shadow-md transition-all hover:border-indigo-300 group" onClick={() => setActivePlaylistId(playlist.id)}>
                        <CardContent className="p-6 pt-6 flex flex-col h-full">
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-sm">
                              <ListMusic size={24} />
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }}
                              className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                          <div className="mt-auto">
                            <h3 className="text-xl font-bold text-slate-800 mb-1">{playlist.name}</h3>
                            <p className="text-sm font-medium text-slate-500 bg-slate-100 w-fit px-2.5 py-1 rounded-md">{playlist.songIds.length} {playlist.songIds.length === 1 ? 'song' : 'songs'}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div>
                {(() => {
                  const activePlaylist = playlists.find(p => p.id === activePlaylistId);
                  if (!activePlaylist) return null;
                  const playlistSongs = activePlaylist.songIds.map(id => songs.find(s => s.id === id)).filter(Boolean);

                  return (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="flex items-center gap-4 mb-8 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                        <button onClick={() => setActivePlaylistId(null)} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-600">
                          <ArrowLeft size={24} />
                        </button>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-800">{activePlaylist.name}</h2>
                          <p className="text-sm font-medium text-indigo-600">{playlistSongs.length} songs in this list</p>
                        </div>
                      </div>

                      {playlistSongs.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                          <p className="text-slate-500 font-medium">This playlist is empty.</p>
                          <p className="text-slate-400 text-sm mt-1">Go to your library to add some tracks!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {playlistSongs.map((song) => (
                            <Card key={song.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                              <CardHeader>
                                <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md mb-3 w-fit">
                                  {song.genre}
                                </span>
                                <CardTitle className="line-clamp-1">{song.name}</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="relative h-28 overflow-hidden rounded-xl bg-slate-50 border border-slate-100 p-4">
                                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
                                  <p className="text-sm font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">{song.text || 'No lyrics/chords added.'}</p>
                                </div>
                              </CardContent>
                              <CardFooter className="justify-end bg-white">
                                <button 
                                  onClick={() => toggleSongInPlaylist(activePlaylist.id, song.id)}
                                  className="text-sm text-red-600 font-medium px-4 py-2 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  Remove from List
                                </button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {}
        <div style={{ display: view === 'songs' ? 'block' : 'none' }}>
          {isAddingMode ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <Card className="max-w-2xl mx-auto shadow-md border-indigo-100">
                <form onSubmit={handleSaveSong}>
                  <CardHeader className="bg-indigo-50 border-b border-indigo-100">
                    <CardTitle className="text-indigo-900">{editingSongId ? 'Edit Song' : 'Add New Song'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Song Title</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        placeholder="e.g. Wonderwall"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Genre</label>
                      <select
                        value={formData.genre}
                        onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
                      >
                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lyrics / Chords</label>
                      <textarea
                        value={formData.text}
                        onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                        className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[200px] font-mono text-sm transition-all resize-y"
                        placeholder="[G]Today is gonna be the [Em]day..."
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-3 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setIsAddingMode(false)}
                      className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
                    >
                      <Save size={18} />
                      Save Song
                    </button>
                  </CardFooter>
                </form>
              </Card>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-grow">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search by title or lyrics..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm transition-all"
                  />
                </div>
                <div className="relative min-w-[200px]">
                  <Filter className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  <select
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none shadow-sm transition-all"
                  >
                    <option value="All">All Genres</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <button 
                  onClick={handleAddNew}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-sm"
                >
                  <Plus size={20} />
                  <span>Add Song</span>
                </button>
              </div>

              {filteredSongs.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="text-slate-400" size={24} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">No songs found</h3>
                  <p className="text-slate-500">Try adjusting your search or add a new song.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSongs.map((song) => (
                    <Card key={song.id} className="flex flex-col h-full hover:shadow-md transition-shadow group">
                      <CardHeader className="pb-3 flex justify-between items-start flex-row">
                        <div>
                           <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md mb-3">
                            {song.genre}
                          </span>
                          <CardTitle className="line-clamp-1">{song.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <div className="relative h-32 overflow-hidden rounded-xl bg-slate-50 border border-slate-100 p-4 group-hover:bg-indigo-50/30 transition-colors">
                          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-50 group-hover:from-[rgb(244,246,255)] to-transparent pointer-events-none transition-colors"></div>
                          <p className="text-sm font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">
                            {song.text || 'No lyrics/chords added.'}
                          </p>
                        </div>
                        {song.lastPracticed && (
                           <p className="text-xs font-medium text-slate-400 mt-4 flex items-center gap-1.5">
                             <BookOpen size={14} /> Added: {song.lastPracticed}
                           </p>
                        )}
                      </CardContent>
                      
                      <CardFooter className="justify-end gap-2 bg-white">
                        <button 
                          onClick={() => setPlaylistModal({ isOpen: true, songId: song.id })}
                          className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="Add to Playlist"
                        >
                          <ListPlus size={20} />
                        </button>
                        <button 
                          onClick={() => handleEdit(song)}
                          className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                          title="Edit Song"
                        >
                          <Edit2 size={20} />
                        </button>
                        <button 
                          onClick={() => handleDelete(song.id)}
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Delete Song"
                        >
                          <Trash2 size={20} />
                        </button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}