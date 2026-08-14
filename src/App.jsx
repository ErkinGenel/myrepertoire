import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Plus, ListMusic, X, Edit2, Trash2, Play, ChevronRight, ChevronDown, Check, Lock, ChevronLeft, Camera, Loader2, Database, Grid, List } from 'lucide-react';
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';

// Base configuration (API Key removed for security)
const firebaseConfig = {
  authDomain: "myrepertoiregithub.firebaseapp.com",
  projectId: "myrepertoiregithub",
  storageBucket: "myrepertoiregithub.firebasestorage.app",
  messagingSenderId: "248740253880",
  appId: "1:248740253880:web:0ee3562276e225fcae244d"
};

// Initialize variables empty; they will be set dynamically
let app, db, auth;

const GENRES = ['Pop', 'Rock', 'Jazz', 'Classical', 'Folk', 'R&B', 'Country', 'Other'];

export default function RepertoireApp() {
  // System Readiness State
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [firebaseKeyInput, setFirebaseKeyInput] = useState('');

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [user, setUser] = useState(null);

  // Core Data State
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  
  // UI View State
  const [activeTab, setActiveTab] = useState('library');
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  
  // Form State
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [editingSongId, setEditingSongId] = useState(null);
  const [formData, setFormData] = useState({ name: '', artist: '', genre: 'Pop', text: '' });
  const [formError, setFormError] = useState('');
  const [isScanningImage, setIsScanningImage] = useState(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const textareaRef = useRef(null);

  // Viewer State
  const [viewingSong, setViewingSong] = useState(null);

  // Playlist Management State
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [expandedPlaylistId, setExpandedPlaylistId] = useState(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);

  const setupFirebase = (apiKey) => {
    try {
      if (getApps().length === 0) {
        app = initializeApp({ ...firebaseConfig, apiKey });
      } else {
        app = getApps()[0];
      }
      db = getFirestore(app);
      auth = getAuth(app);
      setIsFirebaseReady(true);
    } catch (error) {
      console.error("Firebase setup error:", error);
      alert("Invalid Firebase API Key");
      localStorage.removeItem('firebase_api_key');
    }
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('firebase_api_key');
    
    // Auto-inject for Canvas testing environment
    if (typeof __firebase_config !== 'undefined') {
        try {
            const injectedConfig = JSON.parse(__firebase_config);
            setupFirebase(injectedConfig.apiKey);
        } catch (e) {
            console.error("Error parsing injected Firebase config");
        }
    } else if (savedKey) {
        setupFirebase(savedKey);
    }
  }, []);

  const handleSaveFirebaseKey = (e) => {
    e.preventDefault();
    if (firebaseKeyInput.trim()) {
        localStorage.setItem('firebase_api_key', firebaseKeyInput.trim());
        setupFirebase(firebaseKeyInput.trim());
    }
  };

  // 1. Initialize Authentication Correctly on Load
  useEffect(() => {
    if (!isFirebaseReady || !auth) return;

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
  }, [isFirebaseReady]);

  // 2. Fetch Data only when Authenticated & Unlocked
  useEffect(() => {
    if (!isFirebaseReady || !db || !user || !isAuthenticated) return;

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
  }, [isFirebaseReady, isAuthenticated, user]);

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

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  const triggerImageUpload = (e) => {
    // Check if we are in the special Canvas environment which auto-injects keys
    // OR if the user has already saved their own key
    const savedKey = localStorage.getItem('gemini_api_key');
    const isCanvasEnvironment = window.location.hostname.includes('google.com') || window.location.hostname === 'localhost';

    if (savedKey || isCanvasEnvironment) {
       // We have a key or don't need one, proceed to file selection
       document.getElementById('image-upload').click();
    } else {
       // We need a key from the user
       setShowApiKeyPrompt(true);
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('gemini_api_key', apiKeyInput.trim());
      setShowApiKeyPrompt(false);
      // Immediately open the file picker now that we have a key
      setTimeout(() => document.getElementById('image-upload').click(), 100);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanningImage(true);
    setFormError('');

    try {
      const base64Data = await fileToBase64(file);
      
      // Get the key: Either from local storage (if user provided it) or leave empty for Canvas auto-injection
      const savedKey = localStorage.getItem('gemini_api_key');
      const apiKey = savedKey ? savedKey : ""; 
      
      // Upgraded to Gemini 3 Flash Preview for better image understanding
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

      const prompt = `Extract the lyrics and chords from this image. 
      Convert it into a specific format: Place every chord inside square brackets directly in front of the word or syllable it aligns with based on its position in the image. 
      For example, if the chord 'G' is placed directly above the word 'Love', output '[G]Love'. 
      Preserve all verses, choruses, and line breaks. 
      Return ONLY the plain text result without any markdown formatting blocks like \`\`\`.`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data
                }
              }
            ]
          }
        ]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.status === 400 && savedKey) {
          // If a bad request happens and we used a saved key, it might be invalid.
          localStorage.removeItem('gemini_api_key');
          throw new Error("Invalid API Key. Please try again.");
      }
      
      if (result.error) {
          throw new Error(`API Error: ${result.error.message}`);
      }
      
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content) {
        let extractedText = result.candidates[0].content.parts[0].text;
        extractedText = extractedText.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
        
        setFormData(prev => ({ 
          ...prev, 
          text: prev.text ? prev.text + '\n\n' + extractedText : extractedText 
        }));
      } else if (result.promptFeedback) {
        setFormError(`Image rejected by safety filters: ${result.promptFeedback.blockReason}`);
      } else {
        setFormError('Could not extract text from the image. Please ensure the image contains readable text.');
        console.error("Full AI Response:", result);
      }
    } catch (error) {
      console.error("Error scanning image:", error);
      setFormError(error.message || 'An error occurred while scanning the image.');
    } finally {
      setIsScanningImage(false);
      e.target.value = ''; 
    }
  };

  const handleAddNew = () => {
    setFormError('');
    setFormData({ name: '', artist: '', genre: 'Pop', text: '' });
    setEditingSongId(null);
    setIsAddingMode(true);
  };

  const handleEdit = (song) => {
    setFormError('');
    setFormData({ name: song.name, artist: song.artist || '', genre: song.genre, text: song.text || '' });
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
      setFormData({ name: '', artist: '', genre: 'Pop', text: '' });
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
    const matchesSearch = song.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (song.artist && song.artist.toLowerCase().includes(searchQuery.toLowerCase()));
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

  if (!isFirebaseReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-600">
            <Database size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Connect Database</h1>
          <p className="text-slate-500 mb-8 text-sm">
            To keep your app secure on GitHub Pages, enter your Firebase Web API Key. You can find it in your <a href="https://console.firebase.google.com/project/_/settings/general" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline font-semibold">Firebase Project Settings</a>. It will be saved locally on your device.
          </p>
          <form onSubmit={handleSaveFirebaseKey} className="space-y-4">
            <input
              type="password"
              value={firebaseKeyInput}
              onChange={(e) => setFirebaseKeyInput(e.target.value)}
              placeholder="Firebase API Key..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-center"
            />
            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-200 transition-colors"
            >
              Connect Database
            </button>
          </form>
        </div>
      </div>
    );
  }

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
              <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Grid View"
                >
                  <Grid size={20} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="List View"
                >
                  <List size={20} />
                </button>
              </div>
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
          <>
            {filteredSongs.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Music size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg">No songs found.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSongs.map(song => (
                  <div key={song.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800 pr-4 leading-tight">{song.name}</h3>
                        {song.artist && <p className="text-sm text-slate-500 font-medium mt-1">{song.artist}</p>}
                      </div>
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
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredSongs.map(song => (
                  <div key={song.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-slate-800 truncate">{song.name}</h3>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 shrink-0">
                          {song.genre}
                        </span>
                      </div>
                      {song.artist && <p className="text-sm text-slate-500 font-medium truncate">{song.artist}</p>}
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 sm:border-l sm:border-slate-100 sm:pl-4">
                      <button 
                        onClick={() => { setViewingSong(song); setExpandedPlaylistId(null); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-sm transition-colors"
                      >
                        <Play size={16} /> View
                      </button>
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
                ))}
              </div>
            )}
          </>
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
                                      <p className="text-xs text-slate-500 mt-0.5">
                                        {song.artist && <span className="font-medium mr-1.5">{song.artist} •</span>}
                                        <span className="uppercase font-bold tracking-wider">{song.genre}</span>
                                      </p>
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

      {/* Add/Edit Modal */}
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
                  <div>
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
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Artist (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.artist}
                      onChange={(e) => setFormData({...formData, artist: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                      placeholder="e.g. Oasis"
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
                  
                  {/* Smart Chord Toolbar & Image Scanner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm'].map(chord => (
                        <button
                          key={chord}
                          type="button"
                          onMouseDown={(e) => { 
                            e.preventDefault(); 
                            insertChord(chord); 
                          }}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                          {chord}
                        </button>
                      ))}
                    </div>
                    
                    <div>
                      <input 
                        type="file" 
                        id="image-upload" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload}
                        disabled={isScanningImage}
                      />
                      <button 
                        type="button"
                        onClick={triggerImageUpload}
                        disabled={isScanningImage}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm cursor-pointer border ${isScanningImage ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                      >
                        {isScanningImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                        {isScanningImage ? 'Scanning...' : 'Scan Image'}
                      </button>
                    </div>
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
            
            {/* API Key Prompt Modal overlaying the Add/Edit Modal */}
            {showApiKeyPrompt && (
               <div className="absolute inset-0 bg-slate-900/60 rounded-2xl flex items-center justify-center p-6 z-50 backdrop-blur-sm">
                 <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border border-slate-200">
                   <h3 className="text-xl font-bold text-slate-800 mb-2">AI Feature Activation</h3>
                   <p className="text-sm text-slate-600 mb-4">
                     To use the AI Image Scanner on your own hosted site, you need a free Google Gemini API Key. 
                     <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline ml-1">Get one here</a>.
                   </p>
                   <input 
                     type="password"
                     placeholder="Paste API Key here..."
                     value={apiKeyInput}
                     onChange={(e) => setApiKeyInput(e.target.value)}
                     className="w-full p-3 border border-slate-200 rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                   />
                   <div className="flex gap-2 justify-end">
                     <button onClick={() => setShowApiKeyPrompt(false)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                     <button onClick={handleSaveApiKey} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700">Save & Scan</button>
                   </div>
                 </div>
               </div>
            )}
          </div>
        </div>
      )}

      {/* Playlist Modal */}
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

      {/* Song Viewer */}
      {viewingSong && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 z-50">
          <div className="bg-white w-full max-w-4xl max-h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Viewer Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-slate-100 bg-slate-50 relative shrink-0">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 pr-12 leading-tight">{viewingSong.name}</h2>
                {viewingSong.artist && <p className="text-lg text-slate-600 font-medium mt-1">{viewingSong.artist}</p>}
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