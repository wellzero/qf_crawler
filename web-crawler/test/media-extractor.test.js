import MediaExtractor from '../src/parsers/extractors/media-extractor.js';

describe('MediaExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new MediaExtractor();
  });

  describe('extract', () => {
    test('should extract videos and audios', async () => {
      const mockPage = {
        evaluate: async () => []
      };

      extractor.extractVideos = async () => [{ src: 'https://example.com/video.mp4', poster: '' }];
      extractor.extractAudios = async () => [{ src: 'https://example.com/audio.mp3' }];
      extractor.extractAndDownloadImages = async () => [];

      const context = {
        page: mockPage,
        options: {}
      };

      const result = await extractor.extract(context);

      expect(result.videos).toHaveLength(1);
      expect(result.audios).toHaveLength(1);
    });
  });

  describe('extractVideos', () => {
    test('should extract video elements', async () => {
      const mockPage = {
        evaluate: async () => [
          { src: 'https://example.com/video.mp4', poster: 'https://example.com/poster.jpg', width: 640, height: 480 }
        ]
      };

      const result = await extractor.extractVideos(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].src).toBe('https://example.com/video.mp4');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractVideos(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractAudios', () => {
    test('should extract audio elements', async () => {
      const mockPage = {
        evaluate: async () => [
          { src: 'https://example.com/audio.mp3' }
        ]
      };

      const result = await extractor.extractAudios(mockPage);
      expect(result).toHaveLength(1);
      expect(result[0].src).toBe('https://example.com/audio.mp3');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.extractAudios(mockPage);
      expect(result).toEqual([]);
    });
  });
});