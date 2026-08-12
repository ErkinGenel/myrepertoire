import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
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
  PlaySquare,
  User,
  Lock,
  LogOut
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

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmkG9L75KSnFaSG0haIDMcVYQuYuP5mq0",
  authDomain: "myrepertoiregithub.firebaseapp.com",
  projectId: "myrepertoiregithub",
  storageBucket: "myrepertoiregithub.firebasestorage.app",
  messagingSenderId: "248740253880",
  appId: "1:248740253880:web:0ee3562276e225fcae244d"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function RepertoireApp() {
  // App State
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [user, setUser] = useState(null);

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

  // Auth & View State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [viewingSong, setViewingSong] = useState(null);

  // Firebase Auth Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Fetch Data from Firestore
  useEffect(() => {
    if (!user) return;

    const songsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'songs');
    const unsubSongs = onSnapshot(songsRef, (snapshot) => {
      const loadedSongs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSongs(loadedSongs);
    }, (error) => console.error("Error fetching songs:", error));

    const playlistsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'playlists');
    const unsubPlaylists = onSnapshot(playlistsRef, (snapshot) => {
      const loadedPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlaylists(loadedPlaylists);
    }, (error) => console.error("Error fetching playlists:", error));

    return () => {
      unsubSongs();
      unsubPlaylists();
    };
  }, [user]);

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

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'songs', id));
      
      // Remove deleted song from all playlists in DB
      for (const p of playlists) {
        if (p.songIds.includes(id)) {
          const pRef = doc(db, 'artifacts', appId, 'users', user.uid, 'playlists', p.id);
          await updateDoc(pRef, {
            songIds: p.songIds.filter(songId => songId !== id)
          });
        }
      }
    } catch (err) {
      console.error("Error deleting song:", err);
    }
  };

  const handleSaveSong = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !user) return;

    try {
      if (editingSongId) {
        const songRef = doc(db, 'artifacts', appId, 'users', user.uid, 'songs', editingSongId);
        await updateDoc(songRef, formData);
      } else {
        const songsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'songs');
        await addDoc(songsRef, {
          ...formData,
          lastPracticed: new Date().toISOString().split('T')[0]
        });
      }
      setIsAddingMode(false);
      setFormData({ name: '', genre: 'Pop', text: '' });
    } catch (err) {
      console.error("Error saving song:", err);
    }
  };

  // Playlist Handlers
  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !user) return;
    
    try {
      const playlistsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'playlists');
      await addDoc(playlistsRef, {
        name: newPlaylistName,
        songIds: []
      });
      setNewPlaylistName('');
      setIsCreatingPlaylist(false);
    } catch (err) {
      console.error("Error creating playlist:", err);
    }
  };

  const handleDeletePlaylist = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'playlists', id));
      if (activePlaylistId === id) setActivePlaylistId(null);
    } catch (err) {
      console.error("Error deleting playlist:", err);
    }
  };

  const toggleSongInPlaylist = async (playlistId, songId) => {
    if (!user) return;
    const p = playlists.find(p => p.id === playlistId);
    if (!p) return;
    
    try {
      const hasSong = p.songIds.includes(songId);
      const newSongIds = hasSong 
        ? p.songIds.filter(id => id !== songId) 
        : [...p.songIds, songId];
        
      const pRef = doc(db, 'artifacts', appId, 'users', user.uid, 'playlists', playlistId);
      await updateDoc(pRef, { songIds: newSongIds });
    } catch (err) {
      console.error("Error toggling song in playlist:", err);
    }
  };

  // Filtered Data
  const filteredSongs = songs.filter(song => {
    const matchesSearch = song.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (song.text && song.text.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesGenre = selectedGenre === 'All' || song.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const playlistSongs = playlistModal.isOpen && playlistModal.songId 
    ? songs.filter(s => s.id !== playlistModal.songId) // In a real app this might be different logic, but adding a safe default here
    : [];

  const activePlaylist = activePlaylistId ? playlists.find(p => p.id === activePlaylistId) : null;


  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <Card className="w-full max-w-md shadow-xl border-indigo-100">
          <form onSubmit={(e) => {
            e.preventDefault();
            // Simple client-side lock. You can change this validation logic as needed.
            if (loginPassword.length >= 4) {
              setIsLoggedIn(true);
              setLoginError('');
            } else {
              setLoginError('Password must be at least 4 characters.');
            }
          }}>
            <CardHeader className="text-center pb-2 pt-8">
              <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 shadow-inner">
                <Lock size={32} />
              </div>
              <CardTitle className="text-2xl text-slate-800">App Locked</CardTitle>
              <p className="text-slate-500 text-sm mt-2">Enter a password to access your repertoire.</p>
            </CardHeader>
            <CardContent className="pt-4 pb-8 space-y-4">
              <div>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center text-lg tracking-widest bg-slate-50"
                  autoFocus
                />
                {loginError && <p className="text-red-500 text-sm mt-2 text-center font-medium">{loginError}</p>}
              </div>
              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all shadow-md flex justify-center items-center gap-2 text-lg"
              >
                <User size={20} /> Unlock
              </button>
            </CardContent>
          </form>
        </Card>
      </div>
    );
  }

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
        <button
          onClick={() => { setIsLoggedIn(false); setLoginPassword(''); }}
          className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors shadow-sm bg-white border border-slate-200 sm:border-none sm:bg-transparent sm:shadow-none"
          title="Lock App"
        >
          <LogOut size={20} />
        </button>
      </div>
    </div>
  </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative">
        
        {viewingSong && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{viewingSong.name}</h2>
                  <span className="inline-block mt-2 px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md">
                    {viewingSong.genre}
                  </span>
                </div>
                <button onClick={() => setViewingSong(null)} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-200 transition-colors">
                  <X size={28} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-grow bg-white">
                <pre className="font-mono text-slate-700 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                  {viewingSong.text || 'No lyrics/chords added.'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {playlistModal.isOpen && (
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
                  <div className="flex flex-col gap-1 p-2">
                    {playlists.map((playlist) => {
                      const hasSong = playlist.songIds.includes(playlistModal.songId);
                      return (
                        <button
                          key={playlist.id}
                          onClick={() => toggleSongInPlaylist(playlist.id, playlistModal.songId)}
                          className="w-full text-left p-3 rounded-lg flex items-center justify-between hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                        >
                          <span className="font-medium text-slate-700">{playlist.name}</span>
                          {hasSong ? (
                            <CheckCircle2 size={20} className="text-emerald-500" />
                          ) : (
                            <Plus size={20} className="text-slate-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50">
                 {!isCreatingPlaylist ? (
                    <button
                      onClick={() => setIsCreatingPlaylist(true)}
                      className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus size={16} /> New Playlist
                    </button>
                 ) : (
                    <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-3">
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="Playlist name..."
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCreatingPlaylist(false)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium transition-colors text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors text-sm"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                 )}
              </div>
            </div>
          </div>
        )}

        {view === 'songs' ? (
          <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ListMusic className="text-indigo-600" size={24} /> 
                My Library
              </h2>
              <button 
                onClick={handleAddNew}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2 w-full md:w-auto justify-center"
              >
                <Plus size={18} /> Add New Song
              </button>
            </div>

            {/* Search and Filter */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center">
              <div className="relative w-full md:flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="text-slate-400" size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Search songs or lyrics..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-slate-50"
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                 <Filter className="text-slate-400 min-w-fit" size={18} />
                 <div className="flex gap-2 min-w-max">
                   <button
                      onClick={() => setSelectedGenre('All')}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedGenre === 'All' 
                          ? 'bg-slate-800 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All
                    </button>
                    {GENRES.map(genre => {
                      const count = songs.filter(s => s.genre === genre).length;
                      if (count === 0 && selectedGenre !== genre) return null;
                      return (
                        <button
                          key={genre}
                          onClick={() => setSelectedGenre(genre)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            selectedGenre === genre 
                              ? 'bg-slate-800 text-white shadow-sm' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {genre} <span className="opacity-60 text-xs">({count})</span>
                        </button>
                      )
                    })}
                 </div>
              </div>
            </div>

            {/* Add/Edit Form Overlay */}
            {isAddingMode && (
              <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                <Card className="w-full max-w-xl shadow-2xl">
                  <CardHeader className="flex justify-between items-center border-b border-slate-100 bg-slate-50">
                    <CardTitle>{editingSongId ? 'Edit Song' : 'Add New Song'}</CardTitle>
                    <button onClick={() => setIsAddingMode(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors">
                      <X size={24} />
                    </button>
                  </CardHeader>
                  <form onSubmit={handleSaveSong}>
                    <CardContent className="space-y-5 pt-6">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Song Title *</label>
                        <input 
                          type="text" 
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                          placeholder="e.g. Hotel California"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Genre</label>
                        <select 
                          value={formData.genre}
                          onChange={(e) => setFormData({...formData, genre: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                        >
                          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lyrics & Chords</label>
                        <textarea 
                          value={formData.text}
                          onChange={(e) => setFormData({...formData, text: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl h-48 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm bg-slate-50"
                          placeholder="Paste lyrics and chords here..."
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-3 rounded-b-2xl">
                      <button 
                        type="button" 
                        onClick={() => setIsAddingMode(false)}
                        className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-md flex items-center gap-2"
                      >
                        <Save size={18} /> Save Song
                      </button>
                    </CardFooter>
                  </form>
                </Card>
              </div>
            )}

            {/* Song Grid */}
            {filteredSongs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Search size={32} />
                </div>
                <p className="text-xl text-slate-600 font-medium mb-2">No songs found.</p>
                <p className="text-slate-500">Try adjusting your search or filters, or add a new song.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSongs.map((song) => (
                  <Card key={song.id} className="flex flex-col h-full hover:shadow-md transition-shadow group cursor-pointer" onClick={() => setViewingSong(song)}>
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
                    
                    <CardFooter className="justify-end gap-2 bg-white relative z-10">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setPlaylistModal({ isOpen: true, songId: song.id }); }}
                        className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                        title="Add to Playlist"
                      >
                        <ListPlus size={20} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(song); }}
                        className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                        title="Edit Song"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
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
          </>
        ) : (
          /* Playlists View */
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <PlaySquare className="text-indigo-600" size={24} /> 
                My Playlists
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Playlist Sidebar */}
              <div className="lg:col-span-1 space-y-4">
                <Card>
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-lg">Lists</CardTitle>
                  </CardHeader>
                  <div className="p-3 space-y-1">
                    {playlists.length === 0 && (
                       <p className="text-sm text-slate-500 p-3 text-center">No playlists yet.</p>
                    )}
                    {playlists.map(playlist => (
                      <div 
                        key={playlist.id}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${activePlaylistId === playlist.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`}
                        onClick={() => setActivePlaylistId(playlist.id)}
                      >
                        <div>
                          <p className={`font-semibold ${activePlaylistId === playlist.id ? 'text-indigo-700' : 'text-slate-700'}`}>{playlist.name}</p>
                          <p className="text-xs text-slate-500">{playlist.songIds.length} songs</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-white transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <CardFooter className="pt-3 pb-3">
                    {!isCreatingPlaylist ? (
                      <button
                        onClick={() => setIsCreatingPlaylist(true)}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus size={16} /> New Playlist
                      </button>
                    ) : (
                      <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-2 w-full">
                        <input
                          type="text"
                          value={newPlaylistName}
                          onChange={(e) => setNewPlaylistName(e.target.value)}
                          placeholder="Playlist name..."
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsCreatingPlaylist(false)}
                            className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors text-xs"
                          >
                            Create
                          </button>
                        </div>
                      </form>
                    )}
                  </CardFooter>
                </Card>
              </div>

              {/* Active Playlist Details */}
              <div className="lg:col-span-3">
                {activePlaylist ? (
                  <div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-800">{activePlaylist.name}</h3>
                        <p className="text-slate-500 mt-1">{activePlaylist.songIds.length} songs in this list</p>
                      </div>
                    </div>

                    {activePlaylist.songIds.length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                        <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                          <ListMusic size={32} />
                        </div>
                        <p className="text-xl text-slate-600 font-medium mb-2">This playlist is empty.</p>
                        <p className="text-slate-500">Go to your library and add some songs here!</p>
                        <button 
                          onClick={() => setView('songs')}
                          className="mt-6 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors inline-flex items-center gap-2"
                        >
                           <ArrowLeft size={16} /> Back to Library
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {activePlaylist.songIds.map(songId => {
                          const song = songs.find(s => s.id === songId);
                          if (!song) return null;
                          return (
                            <Card key={song.id} className="flex flex-col h-full hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewingSong(song)}>
                              <CardHeader className="pb-3">
                                <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md mb-3 w-fit">
                                  {song.genre}
                               </span>
                                <CardTitle className="line-clamp-1">{song.name}</CardTitle>
                              </CardHeader>
                              <CardContent className="flex-grow">
                                <div className="relative h-28 overflow-hidden rounded-xl bg-slate-50 border border-slate-100 p-4">
                                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none"></div>
                                  <p className="text-sm font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">{song.text || 'No lyrics/chords added.'}</p>
                                </div>
                              </CardContent>
                              <CardFooter className="justify-end bg-white relative z-10 border-t-0 pt-0">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleSongInPlaylist(activePlaylist.id, song.id); }}
                                  className="text-sm text-red-600 font-medium px-4 py-2 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1.5 w-full justify-center border border-red-100"
                                >
                                  <Trash2 size={14} /> Remove
                                </button>
                              </CardFooter>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border border-slate-200 border-dashed text-center px-4">
                     <div className="bg-white p-4 rounded-full shadow-sm mb-4 text-indigo-300">
                        <PlaySquare size={40} />
                     </div>
                     <h3 className="text-xl font-bold text-slate-700 mb-2">Select a Playlist</h3>
                     <p className="text-slate-500 max-w-sm">Choose a playlist from the sidebar to view its songs, or create a new one to start organizing your setlists.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}