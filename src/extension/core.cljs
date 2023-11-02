(ns extension.core
  (:require
   [clojure.string :as str]
   ["vscode" :as vscode]
   ["child_process" :as cp]
   ["os" :as os]
   ["fs" :as fs]
   ["path" :as path]
   ["util" :as util]))

(def ast (atom nil))

(def treeDataEventEmitter (new vscode/EventEmitter))

(def unlink (util/promisify fs/unlink))

(defn slurp [path]
  (fs/readFileSync (path/resolve js/__dirname path) "utf8"))

(defn ffilter [pred coll]
  (first (filter pred coll)))

(defn gen-rand-ast-filename [kind]
  (let [extension (if (= "code" kind) "shs" "json")]
    (str/join "-" [(rand-int 100000) kind extension])))

(def json->clj (comp #(js->clj % :keywordize-keys true) js/JSON.parse))

(defn ->cmd [cmd options]
  (js/Promise.
    (fn [resolve reject]
      (cp/exec cmd options
               (fn [error b c]
                 (if error
                   (reject error)
                   (resolve {:stdout b :stderr c})))))))

(def at-conf {:wire {:emoji "🔗" :rshift 5}
              :template {:emoji "📄" :rshift 9}
              :define {:emoji "🔤" :rshift 7}
              :macro {:emoji "🤖" :rshift 6}
              :mesh {:emoji "🪢" :rshift 5}})

(defn ->location [{:keys [line column]} path kind definition]
  (let [def-rshift (-> at-conf kind :rshift)]
    {:range {:start-pos {:line (dec line) :column (+ column def-rshift)}
             :end-pos {:line (dec line) :column (+ column def-rshift (count definition))}}
     :path path}))

(defn ->label [kind definition]
  (str (-> at-conf kind :emoji) " " definition))

(defn ->ast-blocks [ast]
  (some->> ast :sequence :statements (mapcat (comp :blocks :Pipeline))))

(defn ->defs-ast-info [ast]
  (let [init-blocks (->ast-blocks ast)
        main-filename (-> ast :sequence :metadata :name)]
    (mapcat
      (fn [init-block]
        (let [path (or (some-> init-block :content :Program :metadata :name) main-filename)]
          (some->> (if-let [program (some-> init-block :content :Program)]
                     (->ast-blocks program)
                     [init-block])
                   (keep #(when-let [kind (some-> (#{"wire" "template" "define" "macro" "mesh"} (some-> % :content :Func :name :name)) (keyword))]
                            (let [definition (->> % :content :Func :params (keep (comp :name :Identifier :value)) (first))]
                              (hash-map :definition definition
                                        :label (->label kind definition)
                                        :location (->location (:line_info %) path kind definition))))))))
      init-blocks)))

(defn ->vscode-location [{:keys [path range]}]
  (let [uri (vscode/Uri.file path)
        {:keys [start-pos end-pos]} range]
    #js {"uri" uri
         "range" (new vscode/Range
                      (:line start-pos)
                      (:column start-pos)
                      (:line end-pos)
                      (:column end-pos))}))

(defn reveal-location [location]
  (let [vscode-location (->vscode-location location)
        uri vscode-location.uri]
    (-> uri
        vscode/workspace.openTextDocument
        (.then (fn [doc] (vscode/window.showTextDocument doc)))
        (.then (fn [^js editor]
                 (let [range vscode-location.range
                       pos range.start
                       new-sel (new vscode/Selection pos pos)]
                   (aset editor "selections" #js [new-sel])
                   (editor.revealRange range)))))))

(def outline-provider
  #js {:getTreeItem identity
       :getParent (fn [_] nil)
       :onDidChangeTreeData treeDataEventEmitter.event
       :getChildren #(when-let [doc (some-> vscode/window.activeTextEditor .-document)]
                       (clj->js (get-in @ast [doc.fileName :definitions])))})

(def view-options
  #js {:treeDataProvider outline-provider})

(defn ->ast! [ast]
  (let [editor vscode/window.activeTextEditor
        doc (some-> editor .-document)
        text (some-> doc .getText)]
    (when (and editor (= "shards" (.-languageId doc)))
      (.fire ^js treeDataEventEmitter)
      (when (not= (hash text) (get-in @ast [doc.fileName :code-hash]))
        (let [shards-filename-path (.-path (vscode/workspace.getConfiguration "shards"))
              tmpdir (os/tmpdir)
              rand-ast-path (str/join "/" [tmpdir (gen-rand-ast-filename "ast")])
              cmd (str/join " " [shards-filename-path "ast" doc.fileName "-o" rand-ast-path])]
              (-> (->cmd cmd #js {:cwd tmpdir})
                  (.then (fn [error b c]
                           (println error b c)
                           (when (fs/existsSync rand-ast-path)
                             (swap! ast assoc-in [doc.fileName :code-hash] (hash text))
                             (let [ast-edn (-> rand-ast-path slurp json->clj)]
                               (->> ast-edn (->defs-ast-info) (swap! ast assoc-in [doc.fileName :definitions])))
                             (.fire ^js treeDataEventEmitter)
                             (unlink rand-ast-path))))
                  (.then (fn [err] (some-> err println)))))))))

(defn handle-goto-def [ast]
  (fn [^js doc ^js pos _]
    (when doc
      (let [word-range (.getWordRangeAtPosition doc pos #"[a-z_][a-zA-Z0-9_.-]*")
            word (.getText doc word-range)
            definitions (get-in @ast [doc.fileName :definitions])]
        (->> definitions
             (ffilter #(= word (:definition %)))
             :location
             (->vscode-location))))))

(defn handle-change-selection [selection]
  (println "onDidChangeSelection" selection)
  (reveal-location (-> selection (js->clj :keywordize-keys true) :selection (first) :location)))

(defn reload []
  (.log js/console "Reloading...")
  (js-delete js/require.cache (js/require.resolve "./extension")))

(defn activate [context]
  (doto ^js (.-subscriptions context)
    (.push (vscode/window.onDidChangeVisibleTextEditors (fn [_] (println "onDidChangeVisibleTextEditors") (->ast! ast))))
    (.push (vscode/window.onDidChangeActiveTextEditor (fn [_] (println "onDidChangeActiveTextEditor" (->ast! ast)))))
    (.push (vscode/window.onDidChangeWindowState (fn [_] (println "onDidChangeWindowState" (->ast! ast)))))
    (.push (vscode/workspace.onDidSaveTextDocument (fn [_] (println "onDidSaveTextDocument" (->ast! ast)))))
    (.push (vscode/languages.registerDefinitionProvider "shards" #js {:provideDefinition (handle-goto-def ast)}))
    (.push (-> (vscode/window.createTreeView "shards-outline" view-options)
               (.onDidChangeSelection handle-change-selection)))))

(defn deactivate [])

(def exports #js {:activate activate
                  :deactivate deactivate})
