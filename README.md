# Trade Talk Platform

**Trade Talk** is an AI-powered knowledge exchange platform where users can **teach** to earn points and **learn** by spending points.  
The platform ensures a fair knowledge-sharing ecosystem, powered by **AI recommendations** for personalized project and course suggestions.

---

## Key Features
- **User Authentication**: Login/Signup with Email/Password + Google OAuth.  
- **Teach & Earn**: Upload courses/videos. Earn points when others learn from your content.  
  - **Assessment Generation (Gemini)**: AI-generated MCQs to validate user knowledge before teaching.  
  - **Plagiarism Checker**: Uploaded videos are checked for originality.  
  - **Transcript-to-Topic Similarity**: Video transcripts (via Whisper) are compared with the course topic using Sentence Transformers to ensure relevance.  
- **Browse & Purchase Courses**: Explore other users’ courses, purchase with earned points, and maintain a personalized purchased-course list.  
- **Video Management**: Courses with video content are validated before being added to the public catalog.  
- **Points System**: Each course has a point value. Users spend points to purchase and gain access.  
- **AI Assistant (Gemini-powered)**:  
  - Project recommendations based on user’s teached & purchased courses.  
  - Next course recommendation based on user learning history.  
  - Handles general queries like a chatbot.  
- **Personalized Dashboards**:  
  - Show purchased courses, teached courses, and remaining points.  
  - Logout/profile management.  

---

## Tech Stack

### Frontend
- React.js (functional components + hooks)  
- React Router (navigation)  

### Backend
- FastAPI (Python backend framework, serving APIs)  
- Uvicorn (ASGI server)  

### AI Integration
- **Google Gemini API** → Assessment generation + AI Assistant (recommendations & Q&A)  
- **OpenAI Whisper (local)** → Video-to-text transcript  
- **Sentence Transformer** → Transcript-to-course similarity checks  

### Data Storage
- JSON-based storage (for demo/prototype):  
  - `user_db.json` → stores user accounts, teached courses, and points.  
  - `video_db.json` → stores course/video details.  
  - `purchase_db.json` → tracks purchases by users.  
- Can later be migrated to **PostgreSQL/MySQL/MongoDB** for scalability.  

### Authentication
- Custom FastAPI routes for email/password login & signup  
- Google OAuth 2.0 (for alternative login/signup)  

### Video Handling
- Upload course videos (stored in backend/cloud storage).  
- **Validation Pipeline**:  
  1. **Assessment Check (Gemini)**  
  2. **Plagiarism Check**  
  3. **Transcript-to-Topic Similarity (Whisper + Sentence Transformer)**  
- Only validated courses appear in the public catalog.  
- Video playback support in the frontend.  

---

## How It Works
1. **Signup/Login** → Users authenticate via email/password or Google.  
2. **Teach Courses** → Upload courses (videos).  
   - Pass assessment (Gemini-generated MCQs).  
   - Video is checked for plagiarism + transcript-topic similarity.  
   - If valid, course is published in the public catalog.  
   - Earn points when others purchase your course.  
3. **Browse Courses** → View only other users’ courses in catalog.  
4. **Purchase** → Spend points to unlock a course. Once purchased, can’t buy again.  
5. **Dashboard** → Manage profile, points, purchased courses, and teached courses.  
6. **AI Assistant** → Personalized recommendations for projects & next courses.  

---

## Future Enhancements
- Database migration (SQL/NoSQL).  
- Real-time chat with AI.  
- Gamification (badges, streaks, levels).  
- Leaderboards for top teachers.  
- Cloud storage (AWS S3/Google Cloud Storage) for video handling.  
