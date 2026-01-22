import WidgetKit
import SwiftUI
import AppIntents

struct ConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Canvas Widget Configuration"
    static var description = IntentDescription("Configure your canvas widget appearance")
    
    @Parameter(title: "Widget Tint", description: "Choose a tint color for your widget")
    var tintColor: WidgetTintColor?
}

enum WidgetTintColor: String, AppEnum {
    case blue
    case red
    case green
    case purple
    case orange
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget Tint Color"
    
    static var caseDisplayRepresentations: [WidgetTintColor: DisplayRepresentation] = [
        .blue: "Blue",
        .red: "Red",
        .green: "Green",
        .purple: "Purple",
        .orange: "Orange"
    ]
    
    var uiColor: UIColor {
        switch self {
        case .blue: return .systemBlue
        case .red: return .systemRed
        case .green: return .systemGreen
        case .purple: return .systemPurple
        case .orange: return .systemOrange
        }
    }
}

struct CanvasWidgetProvider: IntentTimelineProvider {
    typealias Intent = ConfigurationIntent
    func placeholder(in context: Context) -> CanvasWidgetEntry {
        CanvasWidgetEntry(date: Date(), imageData: nil, partnershipId: nil, configuration: ConfigurationIntent())
    }
    
    func getSnapshot(for configuration: ConfigurationIntent, in context: Context, completion: @escaping (CanvasWidgetEntry) -> ()) {
        let entry = loadCanvasEntry(configuration: configuration)
        completion(entry)
    }
    
    func getTimeline(for configuration: ConfigurationIntent, in context: Context, completion: @escaping (Timeline<CanvasWidgetEntry>) -> ()) {
        let entry = loadCanvasEntry(configuration: configuration)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 5, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
    
    private func loadCanvasEntry(configuration: ConfigurationIntent) -> CanvasWidgetEntry {
        // ARCHIVED: App Groups removed for Personal Team compatibility
        // Using standard UserDefaults - widgets won't receive data from main app
        // To re-enable: Add App Groups capability and use:
        // let sharedDefaults = UserDefaults(suiteName: "group.com.nikhilsinha.candleapp.widgets")
        let standardDefaults = UserDefaults.standard
        let imageDataString = standardDefaults.string(forKey: "canvasImageData")
        let partnershipId = standardDefaults.string(forKey: "partnershipId")
        
        var imageData: Data? = nil
        if var base64String = imageDataString {
            // Strip data-URI prefix if present (e.g., "data:image/png;base64,")
            if base64String.hasPrefix("data:") {
                if let commaIndex = base64String.firstIndex(of: ",") {
                    base64String = String(base64String[base64String.index(after: commaIndex)...])
                }
            }
            imageData = Data(base64Encoded: base64String)
        }
        
        return CanvasWidgetEntry(date: Date(), imageData: imageData, partnershipId: partnershipId, configuration: configuration)
    }
}

struct CanvasWidgetEntry: TimelineEntry {
    let date: Date
    let imageData: Data?
    let partnershipId: String?
    let configuration: ConfigurationIntent
}

struct CanvasWidgetEntryView: View {
    var entry: CanvasWidgetProvider.Entry
    @Environment(\.widgetFamily) var family
    
    var tintColor: Color {
        if let tint = entry.configuration.tintColor {
            return Color(uiColor: tint.uiColor)
        }
        return Color(red: 0.1, green: 0.1, blue: 0.15)
    }
    
    var body: some View {
        ZStack {
            // Custom tint/background color from configuration
            tintColor
            
            if let imageData = entry.imageData, let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                VStack {
                    Image(systemName: "paintbrush.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.white)
                        .tint(.white)
                    Text("No Canvas Yet")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
        .widgetURL(URL(string: "candle://canvas")!)
    }
}

@main
struct CandleCanvasWidget: Widget {
    let kind: String = "CandleCanvasWidget"
    
    var body: some WidgetConfiguration {
        IntentConfiguration(kind: kind, intent: ConfigurationIntent.self, provider: CanvasWidgetProvider()) { entry in
            CanvasWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Canvas")
        .description("View your shared canvas drawing")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
