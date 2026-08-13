import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Plus, ListMusic, X, Edit2, Trash2, Play, ChevronRight, ChevronDown, Check, Lock, ChevronLeft } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmkG9L75KSnFaSG0haIDMcVYQuYuP5mq0",
  authDomain: "myrepertoiregithub.firebaseapp.com",
  projectId: "myrepertoiregithub",
  storageBucket: "myrepertoiregithub.firebasestorage.app",
  messagingSenderId: "248740253880",
  appId: "1:248740253880:web:0ee3562276e225fcae244d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const GENRES = ['Pop', 'Rock', 'Jazz', 'Classical', 'Folk', 'R&B', 'Country', 'Other'];

export default function RepertoireApp() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [user, setUser] = useState(null);

  // Core Data State
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  
  // UI View State
  const [activeTab, setActiveTab] = useState('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  
  // Form State
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [editingSongId, setEditingSongId] = useState(null);
  const [formData, setFormData] = useState({ name: '', genre: 'Pop', text: '' });
  const [formError, setFormError] = useState('');
  const textareaRef = useRef(null);

  // Viewer State
  const [viewingSong, setViewingSong] = useState(null);

  // Playlist Management State
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [expandedPlaylistId, setExpandedPlaylistId] = useState(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);

  // 1. Initialize Authentication Correctly on Load
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Platform specific token handshake or fallback to anonymous auth
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (e) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase auth initialization error:", error);
      }
    };
    
    initAuth();
    
    // Track when the user session is officially ready
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    
    return () => unsubscribe();
  }, []);

  // 2. Fetch Data only when Authenticated & Unlocked
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    // Listen to shared public data folder
    const songsRef = collection(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'songs');
    const playlistsRef = collection(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'playlists');

    const unsubSongs = onSnapshot(songsRef, (snapshot) => {
      const songsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSongs(songsData);
    }, (error) => {
      console.error("Error fetching songs:", error);
    });

    const unsubPlaylists = onSnapshot(playlistsRef, (snapshot) => {
      const playlistsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlaylists(playlistsData);
    }, (error) => {
      console.error("Error fetching playlists:", error);
    });

    return () => {
      unsubSongs();
      unsubPlaylists();
    };
  }, [isAuthenticated, user]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === 'myrepertoire') { // Simple password for shared app
      setIsAuthenticated(true);
    } else {
      alert("Incorrect password");
    }
  };

  const insertChord = (chord) => {
    const textarea = textareaRef.current;
    if (!textarea) {
        setFormData({...formData, text: (formData.text || '') + `[${chord}]`});
        return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.text || '';
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = before + `[${chord}]` + after;
    
    setFormData({ ...formData, text: newText });
    
    // Tiny timeout ensures React state updates before we move the cursor
    setTimeout(() => {
      textarea.setSelectionRange(start + chord.length + 2, start + chord.length + 2);
      textarea.focus();
    }, 10);
  };

  const handleAddNew = () => {
    setFormError('');
    setFormData({ name: '', genre: 'Pop', text: '' });
    setEditingSongId(null);
    setIsAddingMode(true);
  };

  const handleEdit = (song) => {
    setFormError('');
    setFormData({ name: song.name, genre: song.genre, text: song.text || '' });
    setEditingSongId(song.id);
    setIsAddingMode(true);
  };

  const handleSaveSong = async () => {
    if (!user) {
      setFormError('Connecting to database... Please wait a moment and try again.');
      return;
    }
    if (!formData.name.trim()) {
      setFormError('Song name is required.');
      return;
    }
    
    setFormError(''); // Clear errors before trying
    const songsRef = collection(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'songs');

    try {
      if (editingSongId) {
        await updateDoc(doc(songsRef, editingSongId), formData);
      } else {
        await addDoc(songsRef, formData);
      }
      
      // Reset and close on success
      setIsAddingMode(false);
      setFormData({ name: '', genre: 'Pop', text: '' });
      setEditingSongId(null);
    } catch (error) {
      console.error("Error saving song:", error);
      if (error.code === 'permission-denied') {
        setFormError("Permission Denied: You need to update your Firestore Database Rules to allow writes.");
      } else {
        setFormError(`Error: ${error.message}`);
      }
    }
  };

  const handleDeleteSong = async (id) => {
    if (confirm("Are you sure you want to delete this song?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'songs', id));
        // Remove from any playlists it might be in
        playlists.forEach(async (playlist) => {
          if (playlist.songIds?.includes(id)) {
            const newSongIds = playlist.songIds.filter(songId => songId !== id);
            await updateDoc(doc(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'playlists', playlist.id), { songIds: newSongIds });
          }
        });
      } catch (error) {
        console.error("Error deleting song:", error);
        alert("Failed to delete song. Check your database rules.");
      }
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const playlistsRef = collection(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'playlists');
      await addDoc(playlistsRef, {
        name: newPlaylistName,
        songIds: []
      });
      setNewPlaylistName('');
    } catch (error) {
       console.error("Error creating playlist:", error);
       alert("Failed to create playlist. Check database rules.");
    }
  };

  const handleDeletePlaylist = async (id) => {
    if (confirm("Delete this playlist? (Songs will remain in your library)")) {
       try {
         await deleteDoc(doc(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'playlists', id));
       } catch (error) {
          console.error("Error deleting playlist:", error);
       }
    }
  };

  const openPlaylistModal = (songId) => {
    setPlaylistModalSongId(songId);
    // Pre-select playlists this song is already in
    const activeIds = playlists.filter(p => p.songIds?.includes(songId)).map(p => p.id);
    setSelectedPlaylistIds(activeIds);
    setIsPlaylistModalOpen(true);
  };

  const togglePlaylistSelection = (playlistId) => {
    setSelectedPlaylistIds(prev => 
      prev.includes(playlistId) 
        ? prev.filter(id => id !== playlistId)
        : [...prev, playlistId]
    );
  };

  const savePlaylistSelection = async () => {
    try {
      for (const playlist of playlists) {
        const isSelected = selectedPlaylistIds.includes(playlist.id);
        const hasSong = playlist.songIds?.includes(playlistModalSongId);
        
        let newSongIds = [...(playlist.songIds || [])];
        let needsUpdate = false;

        if (isSelected && !hasSong) {
          newSongIds.push(playlistModalSongId);
          needsUpdate = true;
        } else if (!isSelected && hasSong) {
          newSongIds = newSongIds.filter(id => id !== playlistModalSongId);
          needsUpdate = true;
        }

        if (needsUpdate) {
           await updateDoc(doc(db, 'artifacts', firebaseConfig.appId, 'public', 'data', 'playlists', playlist.id), { songIds: newSongIds });
        }
      }
      closePlaylistModal();
    } catch (error) {
      console.error("Error saving to playlists:", error);
      alert("Failed to update playlists.");
    }
  };

  const closePlaylistModal = () => {
    setIsPlaylistModalOpen(false);
    setPlaylistModalSongId(null);
    setSelectedPlaylistIds([]);
  };

  const filteredSongs = songs.filter(song => {
    const matchesSearch = song.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || song.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const currentContextIds = expandedPlaylistId 
    ? playlists.find(p => p.id === expandedPlaylistId)?.songIds || []
    : filteredSongs.map(s => s.id);

  const currentSongIndex = viewingSong ? currentContextIds.indexOf(viewingSong.id) : -1;

  const handlePrevSong = () => {
    if (currentSongIndex > 0) {
      const prevId = currentContextIds[currentSongIndex - 1];
      const prevSong = songs.find(s => s.id === prevId);
      if (prevSong) setViewingSong(prevSong);
    }
  };

  const handleNextSong = () => {
    if (currentSongIndex < currentContextIds.length - 1 && currentSongIndex !== -1) {
      const nextId = currentContextIds[currentSongIndex + 1];
      const nextSong = songs.find(s => s.id === nextId);
      if (nextSong) setViewingSong(nextSong);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">My Repertoire</h1>
          <p className="text-slate-500 mb-8">Enter the password to access the shared collection.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-center text-lg tracking-widest"
            />
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md shadow-indigo-200 transition-colors"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-indigo-600">
            <Music size={28} className="drop-shadow-sm" />
            <h1 className="text-2xl font-extrabold tracking-tight">Repertoire</h1>
          </div>
          
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'library' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Music size={16} /> Library
            </button>
            <button 
              onClick={() => { setActiveTab('playlists'); setExpandedPlaylistId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'playlists' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ListMusic size={16} /> Playlists
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Top Controls (Search, Filter, Add) - Only visible in Library tab */}
        {activeTab === 'library' && (
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="Search songs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-shadow"
              />
            </div>
            <div className="flex gap-2">
              <select 
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="bg-white border border-slate-200 py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 shadow-sm cursor-pointer"
              >
                <option value="All">All Genres</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button 
                onClick={handleAddNew}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-6 rounded-xl font-bold transition-all shadow-md shadow-indigo-200 active:scale-95 whitespace-nowrap"
              >
                <Plus size={20} /> <span className="hidden sm:inline">New Song</span>
              </button>
            </div>
          </div>
        )}

        {/* Library View */}
        {activeTab === 'library' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSongs.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-500">
                <Music size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg">No songs found.</p>
              </div>
            ) : (
              filteredSongs.map(song => (
                <div key={song.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-slate-800 pr-4 leading-tight">{song.name}</h3>
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-md border border-slate-200">
                      {song.genre}
                    </span>
                  </div>
                  
                  <div className="flex-grow mt-2 relative">
                    <p className="text-sm text-slate-500 font-mono line-clamp-3 whitespace-pre-wrap">{song.text || "No lyrics added."}</p>
                    <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button 
                      onClick={() => { setViewingSong(song); setExpandedPlaylistId(null); }}
                      className="flex items-center justify-center gap-1.5 flex-grow bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg font-semibold text-sm transition-colors"
                    >
                      <Play size={16} /> View
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => openPlaylistModal(song.id)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Add to Playlist">
                        <ListMusic size={18} />
                      </button>
                      <button onClick={() => handleEdit(song)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edit">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDeleteSong(song.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Playlists View */}
        {activeTab === 'playlists' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Create New Playlist</h2>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="Playlist Name..." 
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="flex-grow px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  onClick={handleCreatePlaylist}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md shadow-indigo-200"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {playlists.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <ListMusic size={48} className="mx-auto mb-4 opacity-20" />
                  <p>You haven't created any playlists yet.</p>
                </div>
              ) : (
                playlists.map(playlist => {
                  const isExpanded = expandedPlaylistId === playlist.id;
                  const playlistSongs = (playlist.songIds || []).map(id => songs.find(s => s.id === id)).filter(Boolean);

                  return (
                    <div key={playlist.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div 
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedPlaylistId(isExpanded ? null : playlist.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                            {isExpanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-800">{playlist.name}</h3>
                            <p className="text-sm text-slate-500 font-medium">{playlistSongs.length} songs</p>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50 p-4">
                          {playlistSongs.length === 0 ? (
                            <p className="text-center text-sm text-slate-500 py-4 italic">No songs in this playlist yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {playlistSongs.map((song, idx) => (
                                <div key={song.id} className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between hover:border-indigo-300 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <span className="text-slate-400 font-mono text-sm w-6 text-right">{idx + 1}.</span>
                                    <div>
                                      <p className="font-bold text-slate-800">{song.name}</p>
                                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{song.genre}</p>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => setViewingSong(song)}
                                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-lg transition-colors"
                                  >
                                    View
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {}
      {isAddingMode && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  {editingSongId ? <Edit2 className="text-indigo-600" /> : <Plus className="text-indigo-600" />}
                  {editingSongId ? 'Edit Song' : 'Add New Song'}
                </h2>
                <button onClick={() => setIsAddingMode(false)} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors">
                  <X size={24} />
                </button>
              </div>

              {formError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-start gap-2">
                  <span>⚠️</span> {formError}
                </div>
              )}

              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Song Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                      placeholder="e.g. Wonderwall"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Genre</label>
                    <select 
                      value={formData.genre}
                      onChange={(e) => setFormData({...formData, genre: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 font-medium text-slate-700 cursor-pointer"
                    >
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex justify-between items-end">
                    <span>Lyrics & Chords</span>
                    <span className="text-xs text-indigo-600 font-medium hidden sm:inline">Use [Chords] for smart formatting</span>
                  </label>
                  
                  {/* Smart Chord Toolbar */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm'].map(chord => (
                      <button
                        key={chord}
                        type="button"
                        onMouseDown={(e) => { 
                          e.preventDefault(); // CRITICAL FIX: Prevents textarea from losing focus!
                          insertChord(chord); 
                        }}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-xs font-bold rounded-lg transition-colors shadow-sm"
                      >
                        {chord}
                      </button>
                    ))}
                  </div>
                  
                  <textarea 
                    ref={textareaRef}
                    value={formData.text}
                    onChange={(e) => setFormData({...formData, text: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl h-64 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm bg-slate-50 leading-relaxed"
                    placeholder="Type lyrics here... Or type: Today is gonna be the [Em]day"
                  />
                </div>

                <div className="pt-4 flex gap-3 justify-end border-t border-slate-100">
                  <button onClick={() => setIsAddingMode(false)} className="px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveSong} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2">
                    <Check size={18} /> Save Song
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isPlaylistModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Add to Playlists</h2>
              <button onClick={closePlaylistModal} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="max-h-64 overflow-y-auto p-4 space-y-2">
              {playlists.length === 0 ? (
                 <p className="text-sm text-slate-500 text-center py-4">No playlists available. Create one first!</p>
              ) : (
                playlists.map(playlist => {
                  const isSelected = selectedPlaylistIds.includes(playlist.id);
                  return (
                    <div 
                      key={playlist.id} 
                      onClick={() => togglePlaylistSelection(playlist.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border ${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700'} transition-all`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                      <span className="font-semibold">{playlist.name}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
               <button onClick={closePlaylistModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                 Cancel
               </button>
               <button onClick={savePlaylistSelection} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors">
                 OK
               </button>
            </div>
          </div>
        </div>
      )}

      {}
      {viewingSong && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 z-50">
          <div className="bg-white w-full max-w-4xl max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Viewer Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50 relative shrink-0">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 pr-12 leading-tight">{viewingSong.name}</h2>
                <span className="inline-block mt-2 px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md border border-indigo-200">
                  {viewingSong.genre}
                </span>
              </div>
              <button 
                onClick={() => setViewingSong(null)} 
                className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-200 transition-colors bg-white border border-slate-200 shadow-sm"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Viewer Body (Smart Chords Rendering) */}
            <div className="p-6 sm:p-10 overflow-y-auto flex-grow bg-white">
              <div className="font-mono text-slate-800 text-sm sm:text-base md:text-lg max-w-none">
                {viewingSong.text ? viewingSong.text.replace(/\r\n/g, '\n').split('\n').map((line, i) => {
                  
                  // Empty line
                  if (line.trim() === '') return <div key={i} className="h-6"></div>;

                  // Section header (e.g. [Chorus], [Verse 1])
                  const isSection = /^\[\s*(verse|chorus|bridge|intro|outro|solo|pre|hook|part|interlude)/i.test(line.trim());
                  if (isSection) {
                     return <div key={i} className="text-indigo-600 font-bold font-sans mt-6 mb-2 tracking-wide uppercase text-sm sm:text-base border-b border-slate-200 pb-1">{line.trim().slice(1, -1)}</div>
                  }

                  // Plain text line
                  if (!line.includes('[')) return <div key={i} className="min-h-[1.5rem] whitespace-pre-wrap leading-relaxed">{line}</div>;
                  
                  // Parse line for smart chords
                  const parts = line.split(/(\[[^\]]+\])/g).filter(Boolean);
                  const pairs = [];
                  let currentChord = '';
                  
                  parts.forEach(part => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                        // If a chord is already waiting, push it without lyrics (e.g. back-to-back chords)
                        if (currentChord) {
                            pairs.push({ chord: currentChord, lyric: '' });
                        }
                        currentChord = part.slice(1, -1);
                    } else {
                        pairs.push({ chord: currentChord, lyric: part });
                        currentChord = '';
                    }
                  });
                  if (currentChord) pairs.push({ chord: currentChord, lyric: '' });

                  return (
                    <div key={i} className="flex flex-wrap items-end mb-4 leading-tight min-h-[3rem]">
                      {pairs.map((pair, j) => (
                          <div key={j} className="flex flex-col justify-end min-h-full">
                            {pair.chord && (
                                <span className="text-indigo-600 font-bold text-sm sm:text-base font-sans mb-0.5">{pair.chord}</span>
                            )}
                            <span className="whitespace-pre-wrap">{pair.lyric}</span>
                          </div>
                      ))}
                    </div>
                  );
                }) : <span className="text-slate-400 italic font-sans">No lyrics or chords added to this song yet.</span>}
              </div>
            </div>

            {/* Viewer Navigation Footer */}
            {currentContextIds.length > 1 && (
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <button 
                  onClick={handlePrevSong}
                  disabled={currentSongIndex <= 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${currentSongIndex <= 0 ? 'text-slate-300 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-100 hover:shadow-sm'}`}
                >
                  <ChevronLeft size={20} /> Prev
                </button>
                <span className="text-sm font-semibold text-slate-500">
                  {currentSongIndex + 1} / {currentContextIds.length}
                </span>
                <button 
                  onClick={handleNextSong}
                  disabled={currentSongIndex >= currentContextIds.length - 1}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${currentSongIndex >= currentContextIds.length - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-100 hover:shadow-sm'}`}
                >
                  Next <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}