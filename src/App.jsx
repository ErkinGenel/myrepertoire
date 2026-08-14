import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Plus, ListMusic, X, Edit2, Trash2, Play, ChevronRight, ChevronDown, Check, Lock, ChevronLeft, Camera, Loader2, Database, Grid, List, Minus, Star, Hash, ChevronUp } from 'lucide-react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";

const GENRES = ['Rock', 'Pop', 'Jazz', 'Blues', 'Folk', 'Classical', 'R&B', 'Country', 'Electronic', 'Other'];

// Transpose helper variables
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'};

const transposeChord = (chord, steps) => {
  const match = chord.match(/^([A-G][b#]?)(.*?)(\/([A-G][b#]?))?$/);
  if (!match) return chord;

  let [, baseNote, modifier, , bassNote] = match;

  const transposeNote = (note) => {
    if (!note) return '';
    let n = FLATS[note] || note;
    let idx = NOTES.indexOf(n);
    if (idx === -1) return note;
    let newIdx = (idx + steps) % 12;
    if (newIdx < 0) newIdx += 12;
    return NOTES[newIdx];
  };

  let transposedBase = transposeNote(baseNote);
  let transposedBass = bassNote ? '/' + transposeNote(bassNote) : '';
  return transposedBase + modifier + transposedBass;
};

const transposeLyrics = (lyrics, steps) => {
  if (steps === 0 || !lyrics) return lyrics;
  return lyrics.replace(/\[(.*?)\]/g, (match, chord) => {
    return '[' + transposeChord(chord, steps) + ']';
  });
};

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      let encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
      if ((encoded.length % 4) > 0) {
        encoded += '='.repeat(4 - (encoded.length % 4));
      }
      resolve(encoded);
    };
    reader.onerror = error => reject(error);
  });
};

// 1. FIREBASE CONFIGURATION (Hardcoded for GitHub Pages)
const myFirebaseConfig = {
  apiKey: "AIzaSyAmkG9L75KSnFaSG0haIDMcVYQuYuP5mq0",
  authDomain: "myrepertoiregithub.firebaseapp.com",
  projectId: "myrepertoiregithub",
  storageBucket: "myrepertoiregithub.firebasestorage.app",
  messagingSenderId: "248740253880",
  appId: "1:248740253880:web:0ee3562276e225fcae244d"
};

export default function RepertoireApp() {
  // Environment Config Fallbacks
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'repertoire-app-id';
  
  // API Keys & Firebase Connection
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);

  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('repertoire_gemini_api_key') || '');
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);

  // Auth & Roles
  const [userRole, setUserRole] = useState(null); // 'admin', 'guest', or null
  const [passwordInput, setPasswordInput] = useState('');
  const [guestNameInput, setGuestNameInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Core Data
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  // UI State
  const [activeTab, setActiveTab] = useState('library'); // 'library', 'playlists', 'wishlist'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSongId, setEditingSongId] = useState(null);
  const [viewingSong, setViewingSong] = useState(null);
  const [transposeSteps, setTransposeSteps] = useState(0);

  // Form States
  const [newSong, setNewSong] = useState({ title: '', artist: '', genre: 'Pop', tempo: '', key: '', lyrics: '', youtubeUrl: '' });
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedWishlistSongId, setSelectedWishlistSongId] = useState('');
  
  // Playlist Management
  const [expandedPlaylistId, setExpandedPlaylistId] = useState(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);

  // AI Scanning
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      // Use Canvas config if testing here, otherwise use your hardcoded config for GitHub Pages
      const config = typeof __firebase_config !== 'undefined' 
        ? JSON.parse(__firebase_config) 
        : myFirebaseConfig; 

      let app;
      if (!getApps().length) {
        app = initializeApp(config);
      } else {
        app = getApps()[0];
      }

      const firebaseDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firebaseDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
        setUser(currentUser);
        setIsAuthenticating(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase init error:", error);
    }
  }, []);

  useEffect(() => {
    if (!db || !user || !userRole) return;

    const songsRef = collection(db, 'artifacts', appId, 'public', 'data', 'songs');
    const playlistsRef = collection(db, 'artifacts', appId, 'public', 'data', 'playlists');
    const wishlistRef = collection(db, 'artifacts', appId, 'public', 'data', 'wishlist');

    const unsubSongs = onSnapshot(songsRef, (snapshot) => {
      setSongs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    const unsubPlaylists = onSnapshot(playlistsRef, (snapshot) => {
      setPlaylists(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);
    
    const unsubWishlist = onSnapshot(wishlistRef, (snapshot) => {
      setWishlist(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    return () => {
      unsubSongs();
      unsubPlaylists();
      unsubWishlist();
    };
  }, [db, user, userRole, appId]);

  const handleLogin = async (e, role) => {
    if (e) e.preventDefault();
    
    if (role === 'admin' && passwordInput !== 'myrepertoire') {
      alert("Incorrect password");
      return;
    }

    setIsAuthenticating(true);
    try {
      if (!user && auth) {
        await signInAnonymously(auth);
      }
      if (role === 'guest') {
        setGuestName(guestNameInput.trim());
        setActiveTab('wishlist');
      } else {
        setActiveTab('library');
      }
      setUserRole(role);
    } catch (error) {
      console.error("Auth error:", error);
      alert("Failed to authenticate with Firebase.");
      setIsAuthenticating(false);
    }
  };

  const handleSaveSong = async () => {
    if (userRole !== 'admin') return;
    if (!newSong.title.trim()) { alert("Title is required!"); return; }
    
    const collectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'songs');
    
    try {
      if (editingSongId) {
        await updateDoc(doc(collectionRef, editingSongId), newSong);
      } else {
        await addDoc(collectionRef, {
          ...newSong,
          createdAt: new Date().toISOString()
        });
      }
      
      setIsFormOpen(false);
      setEditingSongId(null);
      setNewSong({ title: '', artist: '', genre: 'Pop', tempo: '', key: '', lyrics: '', youtubeUrl: '' });
      setScanError('');
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save song. Please check permissions.");
    }
  };

  const handleDeleteSong = async (id) => {
    if (userRole !== 'admin') return;
    if (!confirm("Are you sure you want to delete this song?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'songs', id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleEdit = (song) => {
    if (userRole !== 'admin') return;
    setNewSong({ ...song });
    setEditingSongId(song.id);
    setIsFormOpen(true);
    setScanError('');
  };

  const handleAddNew = () => {
    setNewSong({ title: '', artist: '', genre: 'Pop', tempo: '', key: '', lyrics: '', youtubeUrl: '' });
    setEditingSongId(null);
    setIsFormOpen(true);
    setScanError('');
  };

  const handleCreatePlaylist = async () => {
    if (userRole !== 'admin' || !newPlaylistName.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'playlists'), {
        name: newPlaylistName,
        songIds: [],
        createdAt: new Date().toISOString()
      });
      setNewPlaylistName('');
    } catch (error) {
      console.error("Create playlist error:", error);
    }
  };

  const handleDeletePlaylist = async (id) => {
    if (userRole !== 'admin') return;
    if (!confirm("Delete this playlist?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'playlists', id));
    } catch (error) {
      console.error("Delete playlist error:", error);
    }
  };

  const openPlaylistModal = (songId) => {
    if (userRole !== 'admin') return;
    setPlaylistModalSongId(songId);
    
    // Find which playlists already contain this song
    const currentPlaylists = playlists.filter(p => p.songIds?.includes(songId)).map(p => p.id);
    setSelectedPlaylistIds(currentPlaylists);
    setIsPlaylistModalOpen(true);
  };

  const saveSongToPlaylists = async () => {
    if (userRole !== 'admin') return;
    try {
      for (const playlist of playlists) {
        const playlistRef = doc(db, 'artifacts', appId, 'public', 'data', 'playlists', playlist.id);
        const hasSong = playlist.songIds?.includes(playlistModalSongId);
        const shouldHaveSong = selectedPlaylistIds.includes(playlist.id);

        if (!hasSong && shouldHaveSong) {
          const newSongIds = [...(playlist.songIds || []), playlistModalSongId];
          await updateDoc(playlistRef, { songIds: newSongIds });
        } else if (hasSong && !shouldHaveSong) {
          const newSongIds = playlist.songIds.filter(id => id !== playlistModalSongId);
          await updateDoc(playlistRef, { songIds: newSongIds });
        }
      }
      setIsPlaylistModalOpen(false);
      setPlaylistModalSongId(null);
      setSelectedPlaylistIds([]);
    } catch (error) {
      console.error("Error updating playlists:", error);
    }
  };

  const togglePlaylistSelection = (playlistId) => {
    setSelectedPlaylistIds(prev => 
      prev.includes(playlistId) 
        ? prev.filter(id => id !== playlistId)
        : [...prev, playlistId]
    );
  };

  const handleAddWishlist = async () => {
    if (!selectedWishlistSongId) return;
    const song = songs.find(s => s.id === selectedWishlistSongId);
    if (!song) return;

    // Determine the next order index (put it at the bottom of the list)
    const newOrder = wishlist.length > 0 ? Math.max(...wishlist.map(w => w.order ?? 0)) + 1 : 0;
    const requestor = userRole === 'guest' && guestName ? guestName : (userRole === 'admin' ? 'Admin' : '');

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'wishlist'), {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        addedAt: new Date().toISOString(),
        order: newOrder,
        requestedBy: requestor
      });
      setSelectedWishlistSongId('');
    } catch (error) {
       console.error("Error adding to wishlist:", error);
    }
  };

  const handleDeleteWishlist = async (id) => {
    if (userRole !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', id));
    } catch (error) {
       console.error("Error deleting from wishlist:", error);
    }
  };

  const handleClearWishlist = async () => {
    if (userRole !== 'admin') return;
    if (!confirm("Are you sure you want to clear all songs from the wishlist?")) return;
    try {
      const deletePromises = wishlist.map(item =>
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', item.id))
      );
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Error clearing wishlist:", error);
    }
  };

  const handleTogglePlayed = async (id, currentStatus) => {
    if (userRole !== 'admin') return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', id), {
        played: !currentStatus
      });
    } catch (error) {
      console.error("Error toggling played status:", error);
    }
  };

  const handleMoveWishlist = async (index, direction) => {
    if (userRole !== 'admin') return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedWishlist.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentItem = sortedWishlist[index];
    const targetItem = sortedWishlist[targetIndex];

    const currentOrder = currentItem.order !== undefined ? currentItem.order : index;
    const targetOrder = targetItem.order !== undefined ? targetItem.order : targetIndex;

    let finalCurrentOrder = targetOrder;
    let finalTargetOrder = currentOrder;
    
    // Fallback swap to force reorder if they happen to share the exact same order value
    if (finalCurrentOrder === finalTargetOrder) {
      finalCurrentOrder = targetIndex;
      finalTargetOrder = index;
    }

    try {
      await Promise.all([
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', currentItem.id), { order: finalCurrentOrder }),
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', targetItem.id), { order: finalTargetOrder })
      ]);
    } catch (error) {
      console.error("Error reordering wishlist:", error);
    }
  };

  const handleGeminiKeySubmit = () => {
    if (!geminiApiKey.trim()) return;
    localStorage.setItem('repertoire_gemini_api_key', geminiApiKey.trim());
    setIsGeminiModalOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleScanClick = () => {
    if (!geminiApiKey) {
      setIsGeminiModalOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setScanError('');
    setIsScanning(true);
    
    try {
      const base64Image = await fileToBase64(file);
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;
      
      const payload = {
        contents: [{
          parts: [
            { text: "Extract the lyrics and chords from this image. Format the output exactly like this: [Chord]Lyric text. Do not add any extra commentary or markdown code blocks, just return the plain text with bracketed chords inline." },
            { inlineData: { mimeType: file.type, data: base64Image } }
          ]
        }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "API Error");
      }

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        // Clean up markdown block if the model included it despite instructions
        const cleanText = text.replace(/^```[a-z]*\n/m, '').replace(/```$/m, '').trim();
        setNewSong(prev => ({ ...prev, lyrics: cleanText }));
      } else {
        throw new Error("Could not extract text. Model returned an empty or blocked response.");
      }
    } catch (error) {
      console.error("Scanning error:", error);
      setScanError(error.message || "Failed to scan image. Check console for details.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset input
      }
    }
  };

  // Sort wishlist by order, then by addedAt
  const sortedWishlist = [...wishlist].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 0;
    const orderB = b.order !== undefined ? b.order : 0;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.addedAt) - new Date(b.addedAt);
  });

  const filteredSongs = songs.filter(song => {
    const matchesSearch = 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.artist && song.artist.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGenre = genreFilter === 'All' || song.genre === genreFilter;
    return matchesSearch && matchesGenre;
  });

  if (!userRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">My Repertoire</h1>
          <p className="text-slate-500 mb-8">Log in as an Admin or view the repertoire as a Guest.</p>
          
          <div className="space-y-6">
            <form onSubmit={(e) => handleLogin(e, 'admin')} className="space-y-3">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Admin Password..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-center text-lg tracking-widest"
                disabled={isAuthenticating}
              />
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl shadow-md shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
              >
                {isAuthenticating ? <Loader2 size={20} className="animate-spin" /> : null}
                Unlock as Admin
              </button>
            </form>
            
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">or</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <form onSubmit={(e) => handleLogin(e, 'guest')} className="space-y-3">
              <input
                type="text"
                value={guestNameInput}
                onChange={(e) => setGuestNameInput(e.target.value)}
                placeholder="Your Name (Optional)"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-center text-lg"
                disabled={isAuthenticating}
              />
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm transition-colors"
              >
                Continue as Guest
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (viewingSong) {
    const hasChords = viewingSong.lyrics && viewingSong.lyrics.includes('[');
    
    // Process lyrics to highlight chords and apply transposition
    const processedLyrics = transposeLyrics(viewingSong.lyrics, transposeSteps);
    
    const formattedLyrics = processedLyrics?.split('\n').map((line, idx) => {
      if (!line.trim()) return <div key={idx} className="h-6"></div>;
      
      // If no chords in this specific line, just render normal text
      if (!line.includes('[')) {
        return (
          <div key={idx} className="font-mono whitespace-pre-wrap text-slate-800 mb-1 leading-normal">
            {line}
          </div>
        );
      }
      
      let chordLine = "";
      let lyricLine = "";
      
      const parts = line.split(/(\[[^\]]+\])/);
      
      parts.forEach(part => {
        if (!part) return;
        if (part.startsWith('[') && part.endsWith(']')) {
          const chord = part.slice(1, -1);
          // Pad the chord line to match the lyric position
          if (chordLine.length > lyricLine.length) {
            chordLine += " "; // Add space between overlapping consecutive chords
          } else if (chordLine.length < lyricLine.length) {
            chordLine += " ".repeat(lyricLine.length - chordLine.length);
          }
          chordLine += chord;
        } else {
          lyricLine += part;
        }
      });

      return (
        <div key={idx} className="font-mono whitespace-pre-wrap mb-3 flex flex-col">
          {chordLine.trim().length > 0 && (
            <span className="text-indigo-600 font-bold leading-tight">{chordLine}</span>
          )}
          {lyricLine.length > 0 && (
            <span className="text-slate-800 leading-tight">{lyricLine}</span>
          )}
        </div>
      );
    });

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <button 
              onClick={() => { setViewingSong(null); setTransposeSteps(0); }}
              className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors font-semibold"
            >
              <ChevronLeft size={20} /> Back
            </button>
            {userRole === 'admin' && (
              <button 
                onClick={() => {
                  setViewingSong(null);
                  setTransposeSteps(0);
                  handleEdit(viewingSong);
                }}
                className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold bg-emerald-50 px-4 py-2 rounded-lg"
              >
                <Edit2 size={16} /> Edit
              </button>
            )}
          </div>
        </header>

        <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
              <div>
                <h1 className="text-4xl font-extrabold text-slate-900 mb-2">{viewingSong.title}</h1>
                {viewingSong.artist && <p className="text-xl text-slate-600 font-medium mb-4">{viewingSong.artist}</p>}
                
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-semibold">{viewingSong.genre}</span>
                  {viewingSong.key && <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold flex items-center gap-1"><Music size={14}/> {viewingSong.key}</span>}
                  {viewingSong.tempo && <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold">BPM: {viewingSong.tempo}</span>}
                </div>
              </div>
              
              {hasChords && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center gap-3 shrink-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Transpose</span>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setTransposeSteps(s => s - 1)}
                      className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm"
                    >
                      <Minus size={20} />
                    </button>
                    <span className="font-mono font-bold text-lg text-slate-800 w-8 text-center">
                      {transposeSteps > 0 ? `+${transposeSteps}` : transposeSteps}
                    </span>
                    <button 
                      onClick={() => setTransposeSteps(s => s + 1)}
                      className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  {transposeSteps !== 0 && (
                    <button onClick={() => setTransposeSteps(0)} className="text-xs text-indigo-600 font-semibold hover:underline mt-1">Reset</button>
                  )}
                </div>
              )}
            </div>

            <div className="prose prose-slate max-w-none text-lg">
              {viewingSong.lyrics ? formattedLyrics : <p className="text-slate-400 italic">No lyrics provided.</p>}
            </div>

            {viewingSong.youtubeUrl && (
              <div className="mt-12 pt-8 border-t border-slate-100">
                <a 
                  href={viewingSong.youtubeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-indigo-600 font-semibold hover:text-indigo-700 hover:underline"
                >
                  <Play size={20} /> Listen on YouTube
                </a>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
                <Music size={24} />
              </div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Repertoire</h1>
            </div>
            
            {/* Mobile Tab Switcher */}
            {userRole === 'admin' && (
              <div className="flex sm:hidden bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setActiveTab('library')} className={`p-2 rounded-md ${activeTab === 'library' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><Hash size={18}/></button>
                <button onClick={() => setActiveTab('playlists')} className={`p-2 rounded-md ${activeTab === 'playlists' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><ListMusic size={18}/></button>
                <button onClick={() => setActiveTab('wishlist')} className={`p-2 rounded-md ${activeTab === 'wishlist' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><Star size={18}/></button>
              </div>
            )}
          </div>

          {/* Desktop Tab Switcher */}
          {userRole === 'admin' && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => { setActiveTab('library'); setExpandedPlaylistId(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'library' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Hash size={16} /> Library
              </button>
              <button 
                onClick={() => { setActiveTab('playlists'); setExpandedPlaylistId(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'playlists' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ListMusic size={16} /> Playlists
              </button>
              <button 
                onClick={() => { setActiveTab('wishlist'); setExpandedPlaylistId(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'wishlist' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Star size={16} /> Wishlist
              </button>
            </div>
          )}
          
          {userRole === 'guest' && (
            <div className="hidden sm:block text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              {guestName ? `Guest: ${guestName}` : 'Guest Mode'}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {}
        {activeTab === 'library' && userRole === 'admin' && (
          <div>
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <div className="relative flex-grow">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Search songs or artists..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>
              <div className="flex gap-3">
                <select 
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium text-slate-700"
                >
                  <option value="All">All Genres</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                
                <div className="flex bg-slate-200 p-1 rounded-xl">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    title="Grid View"
                  >
                    <Grid size={20} />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    title="List View"
                  >
                    <List size={20} />
                  </button>
                </div>

                {userRole === 'admin' && (
                  <button 
                    onClick={handleAddNew}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-6 rounded-xl font-bold transition-all shadow-md shadow-indigo-200 active:scale-95 whitespace-nowrap"
                  >
                    <Plus size={20} /> <span className="hidden sm:inline">New Song</span>
                  </button>
                )}
              </div>
            </div>

            {filteredSongs.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                <Music size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-700 mb-1">No songs found</h3>
                <p className="text-slate-500">Try adjusting your search or add a new song.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSongs.map(song => (
                  <div key={song.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800 leading-tight mb-1">{song.title}</h3>
                        {song.artist && <p className="text-sm font-semibold text-slate-500">{song.artist}</p>}
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md shrink-0">{song.genre}</span>
                    </div>
                    
                    <div className="mt-auto pt-6 flex items-center justify-between border-t border-slate-50">
                      <div className="flex gap-2">
                        {song.key && <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-2 py-1 rounded">{song.key}</span>}
                        {song.tempo && <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">{song.tempo} bpm</span>}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button 
                        onClick={() => { setViewingSong(song); setExpandedPlaylistId(null); }}
                        className="flex items-center justify-center gap-1.5 flex-grow bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 rounded-lg font-semibold text-sm transition-colors"
                      >
                        <Play size={16} /> View
                      </button>
                      {userRole === 'admin' && (
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredSongs.map(song => (
                  <div key={song.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-grow">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                        <Music size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{song.title}</h3>
                        {song.artist && <p className="text-sm font-semibold text-slate-500">{song.artist}</p>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 sm:ml-auto">
                       <span className="hidden md:inline-block text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md shrink-0 w-24 text-center">{song.genre}</span>
                       <div className="flex gap-2">
                        <button 
                          onClick={() => { setViewingSong(song); setExpandedPlaylistId(null); }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-sm transition-colors"
                        >
                          <Play size={16} /> View
                        </button>
                        {userRole === 'admin' && (
                          <>
                            <button onClick={() => openPlaylistModal(song.id)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Add to Playlist">
                              <ListMusic size={18} />
                            </button>
                            <button onClick={() => handleEdit(song)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Edit">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDeleteSong(song.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {}
        {activeTab === 'playlists' && userRole === 'admin' && (
          <div className="max-w-3xl mx-auto">
            {userRole === 'admin' && (
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
            )}

            <div className="space-y-4">
              {playlists.length === 0 ? (
                 <div className="text-center py-12 text-slate-500">No playlists created yet.</div>
              ) : (
                playlists.map(playlist => {
                  const isExpanded = expandedPlaylistId === playlist.id;
                  const playlistSongs = (playlist.songIds || []).map(id => songs.find(s => s.id === id)).filter(Boolean);

                  return (
                    <div key={playlist.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div 
                        className="p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedPlaylistId(isExpanded ? null : playlist.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                            <ListMusic size={24} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-800">{playlist.name}</h3>
                            <p className="text-sm text-slate-500 font-medium">{playlistSongs.length} songs</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {userRole === 'admin' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(playlist.id); }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                          <ChevronDown size={24} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-slate-50 border-t border-slate-100 p-4">
                          {playlistSongs.length === 0 ? (
                            <p className="text-center text-slate-500 py-4 text-sm font-medium">Empty playlist</p>
                          ) : (
                            <div className="space-y-2">
                              {playlistSongs.map((song, idx) => (
                                <div key={song.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <span className="text-slate-400 font-mono text-sm font-bold w-6 text-right">{idx + 1}.</span>
                                    <div>
                                      <h4 className="font-bold text-slate-800">{song.title}</h4>
                                      {song.artist && <p className="text-xs text-slate-500 font-semibold">{song.artist}</p>}
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => setViewingSong(song)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-bold rounded-lg transition-colors"
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

        {}
        {activeTab === 'wishlist' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 relative">
              {userRole === 'admin' && wishlist.length > 0 && (
                <button 
                  onClick={handleClearWishlist}
                  className="absolute top-6 right-6 text-sm font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Clear Wishlist
                </button>
              )}
              <h2 className="text-lg font-bold text-slate-800 mb-2">Request a Song</h2>
              <p className="text-sm text-slate-500 mb-4">Select a song from the library to add it to the request queue.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <select 
                  value={selectedWishlistSongId}
                  onChange={(e) => setSelectedWishlistSongId(e.target.value)}
                  className="flex-grow px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Choose a song from the repertoire --</option>
                  {[...songs].sort((a,b) => a.title.localeCompare(b.title)).map(song => (
                    <option key={song.id} value={song.id}>
                      {song.title} {song.artist ? `- ${song.artist}` : ''}
                    </option>
                  ))}
                </select>
                <button 
                  onClick={handleAddWishlist}
                  disabled={!selectedWishlistSongId}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md shadow-indigo-200 whitespace-nowrap"
                >
                  Add Request
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {sortedWishlist.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Star size={48} className="mx-auto mb-4 opacity-20" />
                  <p>The queue is empty. Be the first to request a song!</p>
                </div>
              ) : (
                sortedWishlist.map((item, index) => (
                  <div key={item.id} className={`border rounded-xl p-4 flex items-center justify-between shadow-sm transition-colors ${item.played ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-8 text-center text-slate-400 font-bold font-mono">
                        {index + 1}.
                      </div>
                      <div className={`p-2 rounded-full ${item.played ? 'bg-emerald-100 text-emerald-500' : 'bg-amber-100 text-amber-500'}`}>
                        {item.played ? <Check size={20} /> : <Star size={20} className="fill-current" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`text-lg font-bold ${item.played ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.title || item.name}</h3>
                          {item.played && <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">Played</span>}
                        </div>
                        {item.artist && <p className={`text-sm font-medium leading-snug ${item.played ? 'text-slate-400' : 'text-slate-500'}`}>{item.artist}</p>}
                        {item.requestedBy && (
                          <p className={`text-xs font-semibold mt-1 ${item.played ? 'text-indigo-400' : 'text-indigo-500'}`}>Requested by: {item.requestedBy}</p>
                        )}
                      </div>
                    </div>
                    {userRole === 'admin' && (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleTogglePlayed(item.id, item.played)}
                          className={`p-2 rounded-lg transition-colors mr-2 ${item.played ? 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                          title={item.played ? "Mark as Unplayed" : "Mark as Played"}
                        >
                          <Check size={18} />
                        </button>
                        <div className="flex flex-col gap-1 mr-2">
                           <button 
                             onClick={() => handleMoveWishlist(index, 'up')}
                             disabled={index === 0}
                             className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 transition-colors"
                             title="Move Up"
                           >
                             <ChevronUp size={16} />
                           </button>
                           <button 
                             onClick={() => handleMoveWishlist(index, 'down')}
                             disabled={index === sortedWishlist.length - 1}
                             className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 transition-colors"
                             title="Move Down"
                           >
                             <ChevronDown size={16} />
                           </button>
                        </div>
                        <button 
                          onClick={() => handleDeleteWishlist(item.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove from Wishlist"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Forms & Modals */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 my-8 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{editingSongId ? 'Edit Song' : 'Add New Song'}</h2>
              <button onClick={() => setIsFormOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">Title *</label>
                  <input type="text" value={newSong.title} onChange={e => setNewSong({...newSong, title: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Song Title" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">Artist</label>
                  <input type="text" value={newSong.artist} onChange={e => setNewSong({...newSong, artist: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Artist Name" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">Genre</label>
                  <select value={newSong.genre} onChange={e => setNewSong({...newSong, genre: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">Original Key</label>
                  <input type="text" value={newSong.key} onChange={e => setNewSong({...newSong, key: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. C, G#m" />
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">Tempo (BPM)</label>
                  <input type="number" value={newSong.tempo} onChange={e => setNewSong({...newSong, tempo: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. 120" />
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm font-bold text-slate-700">YouTube URL</label>
                  <input type="url" value={newSong.youtubeUrl} onChange={e => setNewSong({...newSong, youtubeUrl: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://youtube.com/..." />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    Lyrics & Chords 
                    <span className="text-xs font-normal text-slate-400">(Format: [C]Lyric text)</span>
                  </label>
                  
                  {/* AI Scan Button */}
                  <div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      className="hidden" 
                    />
                    <button 
                      type="button"
                      onClick={handleScanClick}
                      disabled={isScanning}
                      className="flex items-center gap-1.5 text-xs font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                      {isScanning ? 'Scanning...' : 'Scan Image'}
                    </button>
                  </div>
                </div>
                
                {scanError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                    {scanError}
                  </div>
                )}
                
                <textarea 
                  value={newSong.lyrics} 
                  onChange={e => setNewSong({...newSong, lyrics: e.target.value})} 
                  className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 h-64 font-mono text-sm leading-relaxed resize-y" 
                  placeholder="[G]Hello darkness my old [Am]friend..."
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsFormOpen(false)} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={handleSaveSong} className="px-6 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition-colors">Save Song</button>
            </div>
          </div>
        </div>
      )}

      {}
      {isPlaylistModalOpen && userRole === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">Add to Playlists</h3>
              <button onClick={() => setIsPlaylistModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-2 max-h-60 overflow-y-auto">
              {playlists.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">No playlists available.</p>
              ) : (
                playlists.map(p => {
                  const isSelected = selectedPlaylistIds.includes(p.id);
                  return (
                    <button 
                      key={p.id}
                      onClick={() => togglePlaylistSelection(p.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl mb-1 transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      <span className="font-semibold text-sm">{p.name}</span>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                        {isSelected && <Check size={14} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={saveSongToPlaylists} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors">
                Save Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {isGeminiModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
              <Camera size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Enable AI Scanning</h3>
            <p className="text-sm text-slate-500 mb-6">
              To scan images into lyrics and chords, you need a free Google Gemini API Key. It will be saved securely in your browser.
              <br/><br/>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold hover:underline">
                Get free key from Google AI Studio &rarr;
              </a>
            </p>
            
            <input
              type="text"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-sm font-mono mb-4 text-center"
            />
            
            <div className="flex gap-3">
              <button 
                onClick={() => setIsGeminiModalOpen(false)}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleGeminiKeySubmit}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors"
              >
                Save & Scan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}