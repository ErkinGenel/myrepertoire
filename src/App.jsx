import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Plus, ListMusic, X, Edit2, Trash2, Play, ChevronRight, ChevronDown, Check, Lock, ChevronLeft, Camera, Loader2, Database, Grid, List, Minus, Star, Hash, ChevronUp, BarChart2, Download, Upload } from 'lucide-react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc } from "firebase/firestore";

const GENRES = ['Rock', 'Pop', 'Jazz', 'Blues', 'Folk', 'Classical', 'R&B', 'Country', 'Electronic', 'Other'];
const MUSICAL_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cm', 'C#m', 'Dbm', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm'];

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

const detectKey = (lyrics) => {
  if (!lyrics) return '';
  // Find all chords in the text
  const chordMatches = [...lyrics.matchAll(/\[(.*?)\]/g)];
  if (chordMatches.length === 0) return '';
  
  // The last chord of a song is usually the most reliable indicator of the tonic (key)
  const lastChord = chordMatches[chordMatches.length - 1][1];
  
  // Clean up the chord to get just the base note and major/minor quality (e.g. Am7/G -> Am)
  const match = lastChord.match(/^([A-G][b#]?)(m?)/);
  if (match) {
    const detected = match[1] + match[2];
    if (MUSICAL_KEYS.includes(detected)) {
      return detected;
    }
  }
  return '';
};

const getRootIndex = (keyStr) => {
  if (!keyStr) return -1;
  const match = keyStr.match(/^([A-G][b#]?)/);
  if (!match) return -1;
  let note = match[1];
  note = FLATS[note] || note;
  return NOTES.indexOf(note);
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

const generateAIContentWithFallback = async (payload, apiKey) => {
  // Ordered list of models to try. If one fails due to quota, it instantly tries the next.
  const models = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  let lastError;

  for (const model of models) {
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();

      if (data.error) {
        const isRateLimit = data.error.code === 429 || data.error.message.toLowerCase().includes("quota exceeded");
        if (isRateLimit) {
          console.warn(`[Auto-Fallback] Model ${model} quota exceeded. Switching to next model...`);
          lastError = new Error(data.error.message);
          continue; // Instantly skip to the next model in the array
        }
        throw new Error(data.error.message || "API Error");
      }
      
      return { data, usedModel: model }; // Success! Return the data and the model used
    } catch (error) {
      lastError = error;
      if (error.message.toLowerCase().includes("quota exceeded") || error.message.includes("429")) {
        continue; // Instantly skip to the next model
      }
      throw error; // If it's a different error (like a bad API key), stop trying and throw it
    }
  }
  
  // If the loop finishes and all models are exhausted
  throw lastError || new Error("All fallback models exhausted their quotas.");
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
  const [guestId, setGuestId] = useState('');
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
  const [artistFilter, setArtistFilter] = useState('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCustomGenre, setIsCustomGenre] = useState(false);
  const [editingSongId, setEditingSongId] = useState(null);
  const [viewingSong, setViewingSong] = useState(null);
  const [transposeSteps, setTransposeSteps] = useState(0);

  // Form States
  const [newSong, setNewSong] = useState({ title: '', artist: '', genre: 'Pop', tempo: '', key: '', lyrics: '', youtubeUrl: '' });
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedWishlistSongId, setSelectedWishlistSongId] = useState('');
  const [wishlistGenreFilter, setWishlistGenreFilter] = useState('All');
  const [wishlistArtistFilter, setWishlistArtistFilter] = useState('All');
  
  // Playlist Management
  const [expandedPlaylistId, setExpandedPlaylistId] = useState(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistModalSongId, setPlaylistModalSongId] = useState(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);

  // AI Scanning
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastUsedModel, setLastUsedModel] = useState('');
  const fileInputRef = useRef(null);

  // Database Backup
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef(null);

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
        setGuestId(crypto.randomUUID());
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
    setIsCustomGenre(false);
    setIsFormOpen(true);
    setScanError('');
  };

  const handleKeyChange = (e) => {
    const newKey = e.target.value;
    const oldKey = newSong.key;

    let updatedSong = { ...newSong, key: newKey };

    // If we are changing from an existing valid key to a new valid key, auto-transpose the text
    if (oldKey && newKey && newSong.lyrics) {
      const oldRootIdx = getRootIndex(oldKey);
      const newRootIdx = getRootIndex(newKey);
      
      if (oldRootIdx !== -1 && newRootIdx !== -1) {
        let steps = newRootIdx - oldRootIdx;
        updatedSong.lyrics = transposeLyrics(newSong.lyrics, steps);
      }
    }
    setNewSong(updatedSong);
  };

  const handleAddNew = () => {
    setNewSong({ title: '', artist: '', genre: 'Pop', tempo: '', key: '', lyrics: '', youtubeUrl: '' });
    setEditingSongId(null);
    setIsCustomGenre(false);
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
    const requestor = userRole === 'guest' && guestName ? guestName : (userRole === 'admin' ? 'Admin' : 'Guest');

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'wishlist'), {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        addedAt: new Date().toISOString(),
        order: newOrder,
        requestedBy: requestor,
        requesterId: userRole === 'admin' ? 'admin' : guestId
      });
      setSelectedWishlistSongId('');
    } catch (error) {
       console.error("Error adding to wishlist:", error);
    }
  };

  const handleDeleteWishlist = async (id, itemRequesterId) => {
    // Admin can delete anything. Guest can only delete their own entries matching their session ID.
    if (userRole !== 'admin' && (userRole !== 'guest' || itemRequesterId !== guestId)) {
      return;
    }
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

  const handleAIFetchClick = () => {
    if (!geminiApiKey) {
      setIsGeminiModalOpen(true);
    } else {
      handleAIFetch();
    }
  };

  const handleAIFetch = async () => {
    if (!newSong.title.trim()) {
      alert("Please enter a Song Title first!");
      return;
    }
    
    setScanError('');
    setIsScanning(true); // Re-use the loading state to disable buttons
    setLastUsedModel('');
    
    try {
      const prompt = `Find the full, exact, and accurate lyrics and chords for the song "${newSong.title}" ${newSong.artist ? `by ${newSong.artist}` : ''}. 
CRITICAL INSTRUCTIONS: 
1. Output MUST be formatted exactly like this: [Chord]Lyric text. 
2. Do NOT invent, hallucinate, or guess lyrics. Retrieve the accurate, original text for the entire song.
3. Do not add any extra commentary, conversational text, or markdown code blocks. Just return the plain text with bracketed chords inline. Ensure chords are musically accurate.`;
      
      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };

      const { data, usedModel } = await generateAIContentWithFallback(payload, geminiApiKey);
      setLastUsedModel(usedModel);

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        // Clean up markdown block if the model included it despite instructions
        const cleanText = text.replace(/^```[a-z]*\n/m, '').replace(/```$/m, '').trim();
        
        // Auto-detect the key from the AI extracted chords
        const detectedKey = detectKey(cleanText);
        
        setNewSong(prev => ({ 
          ...prev, 
          lyrics: cleanText,
          key: detectedKey || prev.key
        }));
      } else {
        throw new Error("Could not fetch text. Model returned an empty or blocked response.");
      }
    } catch (error) {
      console.error("Fetching error:", error);
      let errorMessage = error.message || "Failed to fetch lyrics. Please check your API key or try again.";
      if (errorMessage.toLowerCase().includes("quota exceeded") || errorMessage.includes("429")) {
        errorMessage = "⏳ AI Rate Limit Reached across all models. Please wait 20 seconds and try again.";
      }
      setScanError(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  const handleExportDb = () => {
    const data = { songs, playlists, wishlist };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repertoire_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportDb = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.songs && !data.playlists) {
          alert("Invalid backup file format.");
          return;
        }

        if (!confirm("Are you sure you want to restore this backup? Existing data with matching IDs will be overwritten.")) return;

        setIsImporting(true);

        const restoreItems = async (items, collectionName) => {
          if (!items) return;
          for (const item of items) {
            const { id, ...itemData } = item;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, id), itemData);
          }
        };

        // Restore all collections
        await Promise.all([
          restoreItems(data.songs, 'songs'),
          restoreItems(data.playlists, 'playlists'),
          restoreItems(data.wishlist, 'wishlist')
        ]);

        alert("Database restored successfully!");
        setIsDbModalOpen(false);
      } catch (error) {
        console.error("Import error:", error);
        alert("Error importing database: " + error.message);
      } finally {
        setIsImporting(false);
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setScanError('');
    setIsScanning(true);
    setLastUsedModel('');
    
    try {
      const base64Image = await fileToBase64(file);
      
      const payload = {
        contents: [{
          parts: [
            { text: "Extract the lyrics and chords from this image. Format the output exactly like this: [Chord]Lyric text. Do not add any extra commentary or markdown code blocks, just return the plain text with bracketed chords inline." },
            { inlineData: { mimeType: file.type, data: base64Image } }
          ]
        }]
      };

      const { data, usedModel } = await generateAIContentWithFallback(payload, geminiApiKey);
      setLastUsedModel(usedModel);

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        // Clean up markdown block if the model included it despite instructions
        const cleanText = text.replace(/^```[a-z]*\n/m, '').replace(/```$/m, '').trim();
        
        // Auto-detect the key from the AI extracted chords
        const detectedKey = detectKey(cleanText);
        
        setNewSong(prev => ({ 
          ...prev, 
          lyrics: cleanText,
          key: detectedKey || prev.key
        }));
      } else {
        throw new Error("Could not extract text. Model returned an empty or blocked response.");
      }
    } catch (error) {
      console.error("Scanning error:", error);
      let errorMessage = error.message || "Failed to scan image. Check console for details.";
      if (errorMessage.toLowerCase().includes("quota exceeded") || errorMessage.includes("429")) {
        errorMessage = "⏳ AI Rate Limit Reached across all models. Please wait 20 seconds and try again.";
      }
      setScanError(errorMessage);
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

  // Automatically collect any custom genres used in songs and combine them with the default GENRES list
  const dynamicGenres = Array.from(new Set([...GENRES, ...songs.map(s => s.genre)])).filter(Boolean).sort();
  const dynamicArtists = Array.from(new Set(songs.map(s => s.artist))).filter(Boolean).sort();

  const filteredSongs = songs.filter(song => {
    const matchesSearch = 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.artist && song.artist.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesGenre = genreFilter === 'All' || song.genre === genreFilter;
    const matchesArtist = artistFilter === 'All' || song.artist === artistFilter;
    return matchesSearch && matchesGenre && matchesArtist;
  }).sort((a, b) => a.title.localeCompare(b.title));

  const totalSongs = songs.length;
  const totalPlaylists = playlists.length;
  const pendingRequests = wishlist.filter(w => !w.played).length;
  
  const genreCounts = songs.reduce((acc, song) => {
    if (song.genre) {
      acc[song.genre] = (acc[song.genre] || 0) + 1;
    }
    return acc;
  }, {});
  
  let topGenre = 'N/A';
  let maxCount = 0;
  for (const [genre, count] of Object.entries(genreCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topGenre = genre;
    }
  }

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
            <div className="flex sm:hidden items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {userRole === 'admin' && (
                  <button onClick={() => setActiveTab('library')} className={`p-2 rounded-md ${activeTab === 'library' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><Hash size={18}/></button>
                )}
                {userRole === 'admin' && (
                  <button onClick={() => setActiveTab('playlists')} className={`p-2 rounded-md ${activeTab === 'playlists' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><ListMusic size={18}/></button>
                )}
                <button onClick={() => setActiveTab('wishlist')} className={`p-2 rounded-md ${activeTab === 'wishlist' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}><Star size={18}/></button>
              </div>
              {userRole === 'admin' && (
                <button 
                  onClick={() => setIsDbModalOpen(true)} 
                  className="p-2 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" 
                  title="Database Backup"
                >
                  <Database size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Desktop Tab Switcher */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl">
              {userRole === 'admin' && (
                <button 
                  onClick={() => { setActiveTab('library'); setExpandedPlaylistId(null); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'library' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Hash size={16} /> Library
                </button>
              )}
              {userRole === 'admin' && (
                <button 
                  onClick={() => { setActiveTab('playlists'); setExpandedPlaylistId(null); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'playlists' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <ListMusic size={16} /> Playlists
                </button>
              )}
              <button 
                onClick={() => { setActiveTab('wishlist'); setExpandedPlaylistId(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'wishlist' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Star size={16} /> Wishlist
              </button>
            </div>
            {userRole === 'admin' && (
              <button 
                onClick={() => setIsDbModalOpen(true)} 
                className="hidden sm:flex items-center justify-center p-2.5 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" 
                title="Database Backup"
              >
                <Database size={18} />
              </button>
            )}
          </div>
          
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
            {}
            {userRole === 'admin' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0"><Music size={20}/></div>
                  <div><p className="text-sm text-slate-500 font-semibold">Total Songs</p><p className="text-xl font-bold text-slate-800">{totalSongs}</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg shrink-0"><ListMusic size={20}/></div>
                  <div><p className="text-sm text-slate-500 font-semibold">Playlists</p><p className="text-xl font-bold text-slate-800">{totalPlaylists}</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Star size={20}/></div>
                  <div><p className="text-sm text-slate-500 font-semibold">Pending Reqs</p><p className="text-xl font-bold text-slate-800">{pendingRequests}</p></div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:shadow-md">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-lg shrink-0"><BarChart2 size={20}/></div>
                  <div className="min-w-0"><p className="text-sm text-slate-500 font-semibold">Top Genre</p><p className="text-xl font-bold text-slate-800 truncate" title={topGenre}>{topGenre}</p></div>
                </div>
              </div>
            )}

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
              <div className="flex flex-wrap gap-3">
                <select 
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium text-slate-700"
                >
                  <option value="All">All Genres</option>
                  {dynamicGenres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                
                <select 
                  value={artistFilter}
                  onChange={(e) => setArtistFilter(e.target.value)}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium text-slate-700"
                >
                  <option value="All">All Artists</option>
                  {dynamicArtists.map(a => <option key={a} value={a}>{a}</option>)}
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
                              {playlistSongs.map(song => (
                                <div key={song.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                                  <div className="flex items-center gap-3">
                                    <Music size={16} className="text-slate-400" />
                                    <div>
                                      <p className="font-semibold text-slate-800 text-sm leading-tight">{song.title}</p>
                                      {song.artist && <p className="text-xs text-slate-500">{song.artist}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setViewingSong(song); }}
                                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="View"
                                    >
                                      <Play size={16} />
                                    </button>
                                  </div>
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

        {/* WISHLIST TAB */}
        {activeTab === 'wishlist' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center justify-between">
              <div className="flex flex-wrap gap-3">
                 <select 
                   value={selectedWishlistSongId}
                   onChange={(e) => setSelectedWishlistSongId(e.target.value)}
                   className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium text-slate-700"
                 >
                   <option value="">Select a song to request...</option>
                   {songs.map(s => <option key={s.id} value={s.id}>{s.title} {s.artist ? `- ${s.artist}` : ''}</option>)}
                 </select>
                 <button 
                   onClick={handleAddWishlist}
                   disabled={!selectedWishlistSongId}
                   className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md shadow-indigo-200 flex items-center gap-2"
                 >
                   <Plus size={20} /> Request
                 </button>
              </div>
              
              <div className="flex flex-wrap gap-3 items-center">
                <select 
                  value={wishlistGenreFilter}
                  onChange={(e) => setWishlistGenreFilter(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-sm"
                >
                  <option value="All">All Genres</option>
                  {dynamicGenres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select 
                  value={wishlistArtistFilter}
                  onChange={(e) => setWishlistArtistFilter(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-sm"
                >
                  <option value="All">All Artists</option>
                  {dynamicArtists.map(a => <option key={a} value={a}>{a}</option>)}
                </select>

                {userRole === 'admin' && wishlist.length > 0 && (
                  <button 
                    onClick={handleClearWishlist}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg font-bold transition-colors shadow-sm ml-auto"
                  >
                    <Trash2 size={16} /> Clear List
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {sortedWishlist.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
                  <Star size={48} className="mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-bold text-slate-700 mb-1">No requests yet</h3>
                  <p className="text-slate-500 text-sm">Select a song from the dropdown above to add it to the wishlist.</p>
                </div>
              ) : (
                sortedWishlist.filter(item => {
                   const songDetails = songs.find(s => s.id === item.songId);
                   if(!songDetails) return true;
                   const matchesGenre = wishlistGenreFilter === 'All' || songDetails.genre === wishlistGenreFilter;
                   const matchesArtist = wishlistArtistFilter === 'All' || songDetails.artist === wishlistArtistFilter;
                   return matchesGenre && matchesArtist;
                }).map((item, index) => {
                  const isOwner = userRole === 'guest' && item.requesterId === guestId;
                  const isAdmin = userRole === 'admin';
                  const canDelete = isAdmin || isOwner;
                  const actualSong = songs.find(s => s.id === item.songId);

                  return (
                    <div key={item.id} className={`bg-white rounded-xl p-4 border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${item.played ? 'border-emerald-200 bg-emerald-50/30 opacity-75' : 'border-slate-200 hover:border-indigo-300'}`}>
                      <div className="flex items-center gap-4 flex-grow min-w-0">
                        <div className="flex flex-col items-center justify-center shrink-0 w-8">
                          <span className="text-lg font-black text-slate-300">#{index + 1}</span>
                        </div>
                        
                        <div className="min-w-0">
                          <h3 className={`font-bold truncate ${item.played ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {item.artist && <span className="text-xs font-semibold text-slate-500">{item.artist}</span>}
                            {item.requestedBy && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                                By: {item.requestedBy}
                              </span>
                            )}
                            {item.played && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Check size={10} /> Played
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                        {actualSong && (
                           <button 
                             onClick={() => setViewingSong(actualSong)}
                             className="p-2 text-indigo-600 hover:bg-indigo-100 bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-sm mr-2"
                           >
                             <Play size={16} /> <span className="hidden sm:inline">View</span>
                           </button>
                        )}

                        {isAdmin && (
                          <>
                            <button onClick={() => handleTogglePlayed(item.id, item.played)} className={`p-2 rounded-lg transition-colors ${item.played ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`} title="Mark Played">
                              <Check size={18} />
                            </button>
                            <div className="flex flex-col border-l border-r border-slate-100 px-1 mx-1">
                              <button onClick={() => handleMoveWishlist(index, 'up')} disabled={index === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ChevronUp size={16} /></button>
                              <button onClick={() => handleMoveWishlist(index, 'down')} disabled={index === sortedWishlist.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ChevronDown size={16} /></button>
                            </div>
                          </>
                        )}
                        
                        {canDelete && (
                          <button onClick={() => handleDeleteWishlist(item.id, item.requesterId)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove Request">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* DATABASE BACKUP MODAL */}
      {isDbModalOpen && userRole === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Database size={20} className="text-indigo-600"/> Database Backup</h3>
              <button onClick={() => setIsDbModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X size={18} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <button 
                onClick={handleExportDb}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl transition-colors border border-indigo-200"
              >
                <Download size={20} /> Export Database to File
              </button>
              
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">or</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={importInputRef}
                  onChange={handleImportDb}
                  className="hidden"
                  id="import-db"
                />
                <label 
                  htmlFor="import-db"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isImporting ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                  Restore from File
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {isFormOpen && userRole === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 my-8 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl shrink-0">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Edit2 size={20} className="text-indigo-600" />
                {editingSongId ? 'Edit Song' : 'Add New Song'}
              </h2>
              <button onClick={() => setIsFormOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 bg-white rounded-xl shadow-sm border border-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Song Title <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={newSong.title} 
                    onChange={e => setNewSong({...newSong, title: e.target.value})} 
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
                    placeholder="e.g. Yesterday"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Artist</label>
                  <input 
                    type="text" 
                    value={newSong.artist} 
                    onChange={e => setNewSong({...newSong, artist: e.target.value})} 
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
                    placeholder="e.g. The Beatles"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Genre</label>
                  {!isCustomGenre ? (
                    <select 
                      value={newSong.genre} 
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsCustomGenre(true);
                          setNewSong({...newSong, genre: ''});
                        } else {
                          setNewSong({...newSong, genre: e.target.value});
                        }
                      }} 
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white"
                    >
                      {dynamicGenres.map(g => <option key={g} value={g}>{g}</option>)}
                      <option disabled>──────────</option>
                      <option value="__ADD_NEW__">+ Add New Genre...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newSong.genre} 
                        onChange={e => setNewSong({...newSong, genre: e.target.value})} 
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
                        placeholder="Type custom genre..."
                        autoFocus
                      />
                      <button 
                        onClick={() => setIsCustomGenre(false)}
                        className="px-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-bold"
                      >
                        <X size={16}/>
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Tempo (BPM)</label>
                    <input 
                      type="number" 
                      value={newSong.tempo} 
                      onChange={e => setNewSong({...newSong, tempo: e.target.value})} 
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
                      placeholder="e.g. 120"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Original Key</label>
                    <select 
                      value={newSong.key} 
                      onChange={handleKeyChange} 
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white"
                    >
                      <option value="">Select...</option>
                      {MUSICAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                      {newSong.key && !MUSICAL_KEYS.includes(newSong.key) && (
                        <option value={newSong.key}>{newSong.key} (Custom)</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">YouTube URL</label>
                <input 
                  type="url" 
                  value={newSong.youtubeUrl} 
                  onChange={e => setNewSong({...newSong, youtubeUrl: e.target.value})} 
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-slate-700">Lyrics & Chords</label>
                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      accept="image/*" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      className="hidden" 
                    />
                    
                    <button 
                      onClick={handleAIFetchClick}
                      disabled={isScanning}
                      className="text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      <span className="hidden sm:inline">Auto-Fetch</span>
                    </button>
                    
                    <button 
                      onClick={handleScanClick}
                      disabled={isScanning}
                      className="text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                      Scan Image
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 mb-2">
                  {lastUsedModel && (
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                      AI Model used: {lastUsedModel}
                    </div>
                  )}
                  {scanError && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm font-medium">
                      {scanError}
                    </div>
                  )}
                </div>
                
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

      {/* PLAYLIST MODAL */}
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
              <Search size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Enable AI Features</h3>
            <p className="text-sm text-slate-500 mb-6">
              To auto-fetch lyrics or scan images, you need a free Google Gemini API Key. It will be saved securely in your browser.
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
